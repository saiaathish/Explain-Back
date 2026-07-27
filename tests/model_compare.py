"""Live dual-model characterization and per-call isolation harness.

The parent process runs each model mix in a fresh subprocess so the global
concept cache cannot leak Call A output between roles. This file is intentionally
not named ``test_*.py`` because it consumes live provider quota.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import backend.llm as llm_module
import backend.main as main_module
from backend.schemas import AnalyzeRequest, Flag, Proposition

ORIGINAL_FILES = tuple(
    f"{index:02d}_{name}.txt"
    for index, name in (
        (1, "fluent_unjustified"),
        (2, "reversed_stoich"),
        (3, "passive_conflation"),
        (4, "hedged"),
        (5, "offtopic"),
        (6, "correct"),
        (7, "mixed_missing_mechanism"),
        (8, "mixed_wrong_direction"),
        (9, "mixed_partial"),
        (10, "mixed_justification"),
    )
)
ALL_FILES = tuple(
    json.loads(
        (ROOT / "samples" / "golden.json").read_text(encoding="utf-8")
    )
)
CONFIGURATIONS = ("prod", "ci", "a_only", "b_only", "c_only")


def overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def best_flag(flags: list[Flag], start: int, end: int) -> Flag | None:
    candidates = [
        flag
        for flag in flags
        if overlap(start, end, flag.start, flag.end) / (end - start) >= 0.5
    ]
    return max(
        candidates,
        key=lambda flag: overlap(start, end, flag.start, flag.end),
        default=None,
    )


def _shape_metrics(
    call: str,
    parsed: Any,
    source: str,
    explanation: str,
    proposition_ids: list[str],
) -> dict[str, Any]:
    metrics = {
        "structure_valid": False,
        "shape_valid": False,
        "item_count": 0,
        "valid_claims": 0,
        "raw_justifications": 0,
        "valid_justifications": 0,
    }
    if call in {"a", "b"}:
        if not isinstance(parsed, list) or not parsed:
            return metrics
        metrics["item_count"] = len(parsed)
        if not all(isinstance(item, dict) for item in parsed):
            return metrics
        ids = [item.get("id") for item in parsed]
        unique_ids = (
            all(isinstance(identifier, str) and identifier for identifier in ids)
            and len(ids) == len(set(ids))
        )
        if call == "a":
            valid = all(
                isinstance(item.get(field), str) and item[field].strip()
                for item in parsed
                for field in ("id", "label", "anchor")
            )
            metrics["structure_valid"] = valid
            anchored = all(item.get("anchor") in source for item in parsed)
            metrics["valid_claims"] = sum(
                isinstance(item.get("anchor"), str)
                and item["anchor"] in source
                for item in parsed
            )
            metrics["shape_valid"] = valid and unique_ids and anchored
            return metrics
        fields_valid = all(
            isinstance(item.get("claim_span"), str)
            and isinstance(item.get("justification_spans"), list)
            and all(
                isinstance(justification, str)
                for justification in item.get("justification_spans", [])
            )
            and item.get("type")
            in {"causal", "descriptive", "comparative"}
            and item.get("certainty") in {"high", "medium", "low"}
            for item in parsed
        )
        metrics["structure_valid"] = fields_valid
        metrics["valid_claims"] = sum(
            isinstance(item.get("claim_span"), str)
            and item["claim_span"] in explanation
            for item in parsed
        )
        justifications = [
            justification
            for item in parsed
            for justification in item.get("justification_spans", [])
            if isinstance(item.get("justification_spans"), list)
        ]
        metrics["raw_justifications"] = len(justifications)
        metrics["valid_justifications"] = sum(
            isinstance(justification, str)
            and justification in explanation
            for justification in justifications
        )
        metrics["shape_valid"] = (
            fields_valid
            and unique_ids
            and metrics["valid_claims"] == len(parsed)
            and metrics["valid_justifications"] == len(justifications)
        )
        return metrics
    if call == "c":
        if not isinstance(parsed, dict):
            return metrics
        verdicts = parsed.get("verdicts")
        if not isinstance(verdicts, list):
            return metrics
        metrics["item_count"] = len(verdicts)
        ids = [
            item.get("prop_id") for item in verdicts if isinstance(item, dict)
        ]
        valid_items = all(
            isinstance(item, dict)
            and item.get("relation") in {"entails", "contradicts", "neutral"}
            and item.get("confidence") in {"high", "medium", "low"}
            and isinstance(item.get("revision_hint"), str)
            and item["revision_hint"].strip()
            for item in verdicts
        )
        follow_up = parsed.get("follow_up")
        metrics["structure_valid"] = (
            valid_items and isinstance(follow_up, str)
        )
        metrics["shape_valid"] = (
            valid_items
            and len(ids) == len(set(ids))
            and set(ids) == set(proposition_ids)
            and isinstance(follow_up, str)
            and follow_up.count("?") == 1
        )
        return metrics
    return metrics


def _set_configuration(name: str) -> None:
    for call in ("A", "B", "C"):
        os.environ.pop(f"LLM_ROLE_{call}", None)
    if name == "prod":
        os.environ["LLM_ROLE"] = "prod"
    elif name == "ci":
        os.environ["LLM_ROLE"] = "ci"
    elif name in {"a_only", "b_only", "c_only"}:
        os.environ["LLM_ROLE"] = "prod"
        os.environ[f"LLM_ROLE_{name[0].upper()}"] = "ci"
    else:
        raise ValueError(f"Unknown configuration: {name}")


def _model_header() -> dict[str, dict[str, str]]:
    return {
        call: {
            "role": llm_module.active_role(call),
            "model": llm_module.active_model(call),
        }
        for call in ("a", "b", "c")
    }


async def _worker(
    configuration: str,
    filenames: list[str],
    repeat: int,
    clear_cache_each: bool,
) -> dict:
    logging.getLogger("backend.main").setLevel(logging.ERROR)
    _set_configuration(configuration)
    if not all(llm_module.is_configured(call) for call in ("a", "b", "c")):
        raise RuntimeError(
            "Configure LLM_API_KEY, LLM_MODEL_PROD (or LLM_MODEL), and LLM_MODEL_CI."
        )

    source = (ROOT / "samples" / "source_sodium_pump.txt").read_text(
        encoding="utf-8"
    ).strip()
    golden = json.loads(
        (ROOT / "samples" / "golden.json").read_text(encoding="utf-8")
    )
    raw_events: list[dict[str, Any]] = []
    real_client_call = llm_module._client_call
    context: dict[str, Any] = {
        "file": "",
        "run": 0,
        "sequence": 0,
        "source": source,
        "explanation": "",
        "proposition_ids": [],
        "attempts": Counter(),
    }

    async def observed_client_call(
        prompt: str,
        timeout: float = 20.0,
        call: str = "generic",
    ) -> str:
        attempt_key = (
            context["file"],
            context["run"],
            context["sequence"],
            call,
        )
        context["attempts"][attempt_key] += 1
        event = {
            "file": context["file"],
            "run": context["run"],
            "call": call,
            "role": llm_module.active_role(call),
            "model": llm_module.active_model(call),
            "attempt": context["attempts"][attempt_key],
        }
        try:
            raw = await real_client_call(prompt, timeout=timeout, call=call)
        except Exception as exc:
            event.update(
                {
                    "direct_json": False,
                    "parseable": False,
                    "schema_valid": False,
                    "error": type(exc).__name__,
                }
            )
            raw_events.append(event)
            raise
        try:
            direct = json.loads(raw.strip())
            direct_json = True
        except json.JSONDecodeError:
            direct = None
            direct_json = False
        try:
            parsed = llm_module.parse_json(raw)
            parseable = True
        except llm_module.LLMResponseError:
            parsed = None
            parseable = False
        repaired_metrics = _shape_metrics(
            call,
            parsed,
            context["source"],
            context["explanation"],
            context["proposition_ids"],
        )
        direct_metrics = _shape_metrics(
            call,
            direct,
            context["source"],
            context["explanation"],
            context["proposition_ids"],
        )
        event.update(
            {
                "direct_json": direct_json,
                "parseable": parseable,
                "schema_valid": repaired_metrics["structure_valid"],
                "contract_valid": repaired_metrics["shape_valid"],
                "direct_shape_valid": direct_metrics["structure_valid"],
                "direct_contract_valid": direct_metrics["shape_valid"],
                "item_count": repaired_metrics["item_count"],
                "valid_claims": repaired_metrics["valid_claims"],
                "raw_justifications": repaired_metrics[
                    "raw_justifications"
                ],
                "valid_justifications": repaired_metrics[
                    "valid_justifications"
                ],
            }
        )
        raw_events.append(event)
        return raw

    llm_module._client_call = observed_client_call
    real_extract_propositions = main_module.extract_propositions
    current_propositions: list[Proposition] = []

    async def observed_extract_propositions(
        source_text: str, explanation: str
    ) -> list[Proposition]:
        propositions = await real_extract_propositions(source_text, explanation)
        current_propositions[:] = propositions
        context["proposition_ids"] = [item.id for item in propositions]
        return propositions

    main_module.extract_propositions = observed_extract_propositions
    results: list[dict[str, Any]] = []
    main_module._concept_cache.clear()
    try:
        for sequence, filename in enumerate(filenames, start=1):
            explanation = (
                ROOT / "samples" / "explanations" / filename
            ).read_text(encoding="utf-8").strip()
            for run_number in range(1, repeat + 1):
                if clear_cache_each:
                    main_module._concept_cache.clear()
                current_propositions.clear()
                context["file"] = filename
                context["run"] = run_number
                context["sequence"] = sequence
                context["explanation"] = explanation
                context["proposition_ids"] = []
                event_start = len(raw_events)
                try:
                    response = await main_module.analyze(
                        AnalyzeRequest(source=source, explanation=explanation)
                    )
                    flags = response.flags
                    error = None
                except Exception as exc:
                    flags = []
                    error = f"{type(exc).__name__}: {exc}"
                expected_states: list[dict[str, Any]] = []
                matched = 0
                for expected in golden[filename]:
                    start = explanation.index(expected["span"])
                    end = start + len(expected["span"])
                    flag = best_flag(flags, start, end)
                    actual = flag.state if flag else "missing"
                    matched += int(actual == expected["state"])
                    expected_states.append(
                        {
                            "span": expected["span"],
                            "expected": expected["state"],
                            "actual": actual,
                        }
                    )
                results.append(
                    {
                        "file": filename,
                        "run": run_number,
                        "error": error,
                        "proposition_count": len(current_propositions),
                        "empty_justification_count": sum(
                            not item.justification_spans
                            for item in current_propositions
                        ),
                        "raw_proposition_count": sum(
                            event.get("item_count", 0)
                            for event in raw_events[event_start:]
                            if event["call"] == "b"
                            and event.get("schema_valid")
                        ),
                        "located_deduplicated_count": len(
                            current_propositions
                        ),
                        "final_flag_count": len(flags),
                        "expected_matched": matched,
                        "expected_total": len(golden[filename]),
                        "states": expected_states,
                        "signature": sorted(
                            (flag.start, flag.end, flag.state) for flag in flags
                        ),
                        "provider_responses": len(raw_events) - event_start,
                        "pipeline_accepted": error is None,
                    }
                )
    finally:
        llm_module._client_call = real_client_call
        main_module.extract_propositions = real_extract_propositions

    return {
        "configuration": configuration,
        "calls": _model_header(),
        "results": results,
        "raw_events": raw_events,
    }


def _run_worker(
    configuration: str,
    filenames: list[str],
    repeat: int,
    *,
    clear_cache_each: bool = False,
) -> dict:
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--worker",
        "--configuration",
        configuration,
        "--repeat",
        str(repeat),
        "--samples",
        *filenames,
    ]
    if clear_cache_each:
        command.append("--clear-cache-each")
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=os.environ.copy(),
        text=True,
        capture_output=True,
        timeout=3600,
        check=False,
    )
    if completed.returncode:
        details = "\n".join(completed.stderr.splitlines()[-20:])
        raise RuntimeError(
            f"{configuration} worker failed ({completed.returncode}).\n{details}"
        )
    return json.loads(completed.stdout)


def _score(run: dict) -> dict[str, Any]:
    results = [item for item in run["results"] if item["run"] == 1]
    matched = sum(item["expected_matched"] for item in results)
    total = sum(item["expected_total"] for item in results)
    original = [item for item in results if item["file"] in ORIGINAL_FILES]
    original_matched = sum(item["expected_matched"] for item in original)
    original_total = sum(item["expected_total"] for item in original)
    return {
        "matched": matched,
        "total": total,
        "score": matched / total if total else 0.0,
        "original_matched": original_matched,
        "original_total": original_total,
        "original_score": (
            original_matched / original_total if original_total else 0.0
        ),
        "proposition_counts": {
            item["file"]: {
                "raw": item["raw_proposition_count"],
                "located_deduplicated": item[
                    "located_deduplicated_count"
                ],
                "final_flags": item["final_flag_count"],
            }
            for item in results
        },
        "provider_responses": sum(
            item["provider_responses"] for item in results
        ),
    }


def _schema_summary(run: dict) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for call in ("a", "b", "c"):
        events = [event for event in run["raw_events"] if event["call"] == call]
        total = len(events)
        output[call] = {
            "responses": total,
            "direct_json": sum(event["direct_json"] for event in events),
            "parseable": sum(event["parseable"] for event in events),
            "schema_valid": sum(event["schema_valid"] for event in events),
            "contract_valid": sum(
                event.get("contract_valid", False) for event in events
            ),
            "direct_schema_valid": sum(
                event.get("direct_shape_valid", False) for event in events
            ),
            "schema_rate": (
                sum(event["schema_valid"] for event in events) / total
                if total
                else 0.0
            ),
            "contract_rate": (
                sum(event.get("contract_valid", False) for event in events)
                / total
                if total
                else 0.0
            ),
            "responses_requiring_retry": sum(
                event.get("attempt", 1) > 1 for event in events
            ),
            "raw_items": sum(event.get("item_count", 0) for event in events),
            "valid_claims": sum(
                event.get("valid_claims", 0) for event in events
            ),
            "raw_justifications": sum(
                event.get("raw_justifications", 0) for event in events
            ),
            "valid_justifications": sum(
                event.get("valid_justifications", 0) for event in events
            ),
        }
    output["pipeline"] = {
        "accepted": sum(item["pipeline_accepted"] for item in run["results"]),
        "total": len(run["results"]),
    }
    return output


def _agreement(reference: dict, candidate: dict) -> dict[str, Any]:
    left_by_file = {
        item["file"]: item["signature"]
        for item in reference["results"]
        if item["run"] == 1
    }
    right_by_file = {
        item["file"]: item["signature"]
        for item in candidate["results"]
        if item["run"] == 1
    }
    confusion: Counter[tuple[str, str]] = Counter()
    state_matched = 0
    exact_span_state_matched = 0
    denominator = 0
    exact_pairs = 0
    relaxed_pairs = 0
    red_transitions = 0
    for filename in sorted(set(left_by_file) | set(right_by_file)):
        left = left_by_file.get(filename, [])
        right = right_by_file.get(filename, [])
        candidates = sorted(
            (
                (
                    overlap(
                        left_item[0],
                        left_item[1],
                        right_item[0],
                        right_item[1],
                    ),
                    left_item[0] == right_item[0]
                    and left_item[1] == right_item[1],
                    left_index,
                    right_index,
                )
                for left_index, left_item in enumerate(left)
                for right_index, right_item in enumerate(right)
            ),
            reverse=True,
        )
        used_left: set[int] = set()
        used_right: set[int] = set()
        for shared, exact, left_index, right_index in candidates:
            if (
                not shared
                or left_index in used_left
                or right_index in used_right
            ):
                continue
            left_item = left[left_index]
            right_item = right[right_index]
            if (
                shared / (left_item[1] - left_item[0]) < 0.5
                or shared / (right_item[1] - right_item[0]) < 0.5
            ):
                continue
            used_left.add(left_index)
            used_right.add(right_index)
            relaxed_pairs += 1
            exact_pairs += int(exact)
            same_state = left_item[2] == right_item[2]
            state_matched += int(same_state)
            exact_span_state_matched += int(exact and same_state)
            confusion[(left_item[2], right_item[2])] += 1
            red_transitions += int(
                right_item[2] == "red" and left_item[2] != "red"
            )
        for index, item in enumerate(left):
            if index not in used_left:
                confusion[(item[2], "missing")] += 1
        for index, item in enumerate(right):
            if index not in used_right:
                confusion[("missing", item[2])] += 1
                red_transitions += int(item[2] == "red")
        denominator += max(len(left), len(right))
    return {
        "matched": state_matched,
        "total": denominator,
        "agreement": state_matched / denominator if denominator else 0.0,
        "exact_span_state_matched": exact_span_state_matched,
        "exact_span_state_agreement": (
            exact_span_state_matched / denominator if denominator else 0.0
        ),
        "exact_pairs": exact_pairs,
        "relaxed_pairs": relaxed_pairs,
        "red_transitions_not_in_production": red_transitions,
        "confusion": {
            f"{source}->{target}": count
            for (source, target), count in sorted(confusion.items())
        },
    }


def _determinism(run: dict) -> dict[str, Any]:
    signatures = [item["signature"] for item in run["results"]]
    reference = signatures[0] if signatures else []
    matching = sum(signature == reference for signature in signatures)
    return {
        "matching_runs": matching,
        "total_runs": len(signatures),
        "rate": matching / len(signatures) if signatures else 0.0,
    }


def _unjustified_summary(run: dict) -> dict[str, Any]:
    samples = [
        item
        for item in run["results"]
        if item["file"] == "01_fluent_unjustified.txt"
    ]
    total = sum(item["proposition_count"] for item in samples)
    empty = sum(item["empty_justification_count"] for item in samples)
    return {
        "empty": empty,
        "total": total,
        "majority_empty": empty > total / 2 if total else False,
    }


def characterize(args: argparse.Namespace) -> dict[str, Any]:
    filenames = list(args.samples or ALL_FILES)
    runs = {}
    for name in CONFIGURATIONS:
        print(f"Running {name} golden/isolation...", flush=True)
        runs[name] = _run_worker(name, filenames, 1)
        print(f"Completed {name} golden/isolation.", flush=True)
    schema_filenames = [
        ORIGINAL_FILES[index % len(ORIGINAL_FILES)]
        for index in range(args.schema_calls)
    ]
    schema_runs = {}
    for name in ("prod", "ci"):
        print(
            f"Running {name} schema characterization "
            f"({args.schema_calls} calls per stage)...",
            flush=True,
        )
        schema_runs[name] = _run_worker(
            name,
            schema_filenames,
            1,
            clear_cache_each=True,
        )
        print(f"Completed {name} schema characterization.", flush=True)
    print("Running CI determinism...", flush=True)
    determinism = _run_worker(
        "ci",
        [args.determinism_sample],
        args.determinism_runs,
    )
    print("Completed CI determinism.", flush=True)
    production = runs["prod"]
    report = {
        "models": {name: run["calls"] for name, run in runs.items()},
        "scores": {name: _score(run) for name, run in runs.items()},
        "schema": {
            name: _schema_summary(run) for name, run in schema_runs.items()
        },
        "agreement_with_production": {
            name: _agreement(production, run)
            for name, run in runs.items()
            if name != "prod"
        },
        "ci_determinism": _determinism(determinism),
        "ci_unjustified": _unjustified_summary(runs["ci"]),
        "quota": {
            name: len(run["raw_events"]) for name, run in runs.items()
        },
        "schema_quota": {
            name: len(run["raw_events"]) for name, run in schema_runs.items()
        },
    }
    output_path = (ROOT / args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", action="store_true")
    parser.add_argument(
        "--confirm-live-matrix",
        action="store_true",
        help="Acknowledge that the parent run consumes production and CI quota.",
    )
    parser.add_argument("--configuration", choices=CONFIGURATIONS, default="ci")
    parser.add_argument("--samples", nargs="*", choices=ALL_FILES)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--clear-cache-each", action="store_true")
    parser.add_argument(
        "--schema-calls",
        type=int,
        choices=range(1, 51),
        default=10,
    )
    parser.add_argument("--determinism-runs", type=int, default=5)
    parser.add_argument(
        "--determinism-sample",
        choices=ORIGINAL_FILES,
        default="06_correct.txt",
    )
    parser.add_argument(
        "--output",
        default="docs/model-comparison.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.worker:
        filenames = list(args.samples or ALL_FILES)
        print(
            json.dumps(
                asyncio.run(
                    _worker(
                        args.configuration,
                        filenames,
                        args.repeat,
                        args.clear_cache_each,
                    )
                ),
                ensure_ascii=False,
            )
        )
        return 0
    if not args.confirm_live_matrix:
        print(
            "BLOCKED: pass --confirm-live-matrix to run the production/CI "
            "comparison and isolation matrix."
        )
        return 2
    report = characterize(args)
    print(f"Model comparison written to {args.output}")
    for name, score in report["scores"].items():
        print(
            f"{name}: original "
            f"{score['original_matched']}/{score['original_total']} = "
            f"{score['original_score']:.1%}; expanded "
            f"{score['matched']}/{score['total']} = {score['score']:.1%}"
        )
    ci_agreement = report["agreement_with_production"]["ci"]
    print(
        "CI agreement with production: "
        f"{ci_agreement['matched']}/{ci_agreement['total']} = "
        f"{ci_agreement['agreement']:.1%}"
    )
    determinism = report["ci_determinism"]
    print(
        "CI determinism: "
        f"{determinism['matching_runs']}/{determinism['total_runs']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
