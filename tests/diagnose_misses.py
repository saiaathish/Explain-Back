"""Repeat the five known golden misses and capture Call B diagnostics.

This is an opt-in live diagnostic, not a pytest test. It uses the real analysis
pipeline while intercepting only the proposition-extraction response so the raw
model output can be compared with the verbatim-span validator's output.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any
from unittest.mock import patch

import backend.extract as extract_module
import backend.main as main_module
from backend.extract import extract_concepts, locate_spans
from backend.llm import (
    active_model,
    active_role,
    call_json as real_call_json,
    is_configured,
)
from backend.schemas import AnalyzeRequest, Flag, Proposition

ROOT = Path(__file__).parents[1]
FAILING_FILES = (
    "01_fluent_unjustified.txt",
    "02_reversed_stoich.txt",
    "06_correct.txt",
    "09_mixed_partial.txt",
    "10_mixed_justification.txt",
)


def overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def best_flag(
    flags: list[Flag], start: int, end: int, minimum_overlap: float = 0.5
) -> Flag | None:
    candidates = [
        flag
        for flag in flags
        if overlap(start, end, flag.start, flag.end) / (end - start)
        >= minimum_overlap
    ]
    return max(
        candidates,
        key=lambda flag: overlap(start, end, flag.start, flag.end),
        default=None,
    )


def best_proposition(
    propositions: list[Proposition],
    start: int,
    end: int,
    minimum_overlap: float = 0.2,
) -> Proposition | None:
    candidates = [
        proposition
        for proposition in propositions
        if overlap(
            start,
            end,
            proposition.claim_start,
            proposition.claim_end,
        )
        / (end - start)
        >= minimum_overlap
    ]
    return max(
        candidates,
        key=lambda proposition: overlap(
            start,
            end,
            proposition.claim_start,
            proposition.claim_end,
        ),
        default=None,
    )


def raw_propositions(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict):
        raw = raw.get("propositions", [])
    return raw if isinstance(raw, list) else []


def raw_match(
    items: list[dict[str, Any]], explanation: str, start: int, end: int
) -> dict[str, Any] | None:
    scored: list[tuple[int, dict[str, Any]]] = []
    for item in items:
        claim = item.get("claim_span")
        if not isinstance(claim, str) or not claim:
            continue
        claim_start = explanation.find(claim)
        if claim_start == -1:
            continue
        score = overlap(start, end, claim_start, claim_start + len(claim))
        if score:
            scored.append((score, item))
    return max(scored, key=lambda pair: pair[0], default=(0, None))[1]


def summarize(results: list[dict[str, Any]]) -> None:
    print("\nAggregate by expected proposition")
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for result in results:
        for item in result["expected"]:
            key = (result["file"], item["span"], item["expected_state"])
            grouped.setdefault(key, []).append(item)

    for (filename, span, expected_state), items in grouped.items():
        extracted = sum(item["actual_state"] != "missing" for item in items)
        states = Counter(item["actual_state"] for item in items)
        raw_found = sum(item["raw_match"] is not None for item in items)
        located_found = sum(item["located_match"] is not None for item in items)
        print(
            f"{filename} expected={expected_state} extracted={extracted}/{len(items)} "
            f"raw_match={raw_found}/{len(items)} "
            f"located_match={located_found}/{len(items)} "
            f"states={dict(states)} span={span!r}"
        )


async def run(args: argparse.Namespace) -> int:
    os.environ["LLM_ROLE"] = os.getenv(
        "DIAGNOSTICS_LLM_ROLE", "ci"
    ).strip().lower()
    if not all(is_configured(call) for call in ("a", "b", "c")):
        print("BLOCKED: configure the selected LLM role.")
        return 2
    print(
        "Diagnostics configuration: "
        + ", ".join(
            f"{call.upper()}={active_model(call)} ({active_role(call)})"
            for call in ("a", "b", "c")
        )
    )

    source = (ROOT / "samples" / "source_sodium_pump.txt").read_text(
        encoding="utf-8"
    ).strip()
    golden = json.loads(
        (ROOT / "samples" / "golden.json").read_text(encoding="utf-8")
    )

    concepts = await extract_concepts(source)
    if not concepts:
        print("BLOCKED: source concept extraction returned no concepts.")
        return 2
    main_module._concept_cache[main_module._cache_key(source)] = concepts

    results: list[dict[str, Any]] = []
    total_runs = len(FAILING_FILES) * args.runs
    completed_runs = 0

    for filename in FAILING_FILES:
        explanation = (
            ROOT / "samples" / "explanations" / filename
        ).read_text(encoding="utf-8").strip()

        for run_number in range(1, args.runs + 1):
            captured: list[Any] = []

            async def capture_call_b(prompt: str, *, call: str) -> Any:
                assert call == "b"
                response = await real_call_json(prompt, call="b")
                captured.append(response)
                return response

            with patch.object(extract_module, "call_json", capture_call_b):
                response = await main_module.analyze(
                    AnalyzeRequest(source=source, explanation=explanation)
                )

            raw = captured[-1] if captured else []
            raw_items = raw_propositions(raw)
            located = locate_spans(raw_items, explanation)
            expected_results: list[dict[str, Any]] = []

            for expected in golden[filename]:
                start = explanation.index(expected["span"])
                end = start + len(expected["span"])
                flag = best_flag(response.flags, start, end)
                located_item = best_proposition(located, start, end)
                raw_item = raw_match(raw_items, explanation, start, end)
                expected_results.append(
                    {
                        "span": expected["span"],
                        "expected_state": expected["state"],
                        "actual_state": flag.state if flag else "missing",
                        "raw_match": raw_item,
                        "located_match": (
                            located_item.model_dump() if located_item else None
                        ),
                        "raw_justification_spans": (
                            raw_item.get("justification_spans", [])
                            if raw_item
                            else []
                        ),
                        "located_justification_spans": (
                            located_item.justification_spans
                            if located_item
                            else []
                        ),
                    }
                )

            run_result = {
                "file": filename,
                "run": run_number,
                "raw_call_b": raw,
                "located_propositions": [
                    proposition.model_dump() for proposition in located
                ],
                "flags": [flag.model_dump() for flag in response.flags],
                "expected": expected_results,
            }
            results.append(run_result)
            completed_runs += 1
            states = Counter(
                item["actual_state"] for item in expected_results
            )
            print(
                f"[{completed_runs}/{total_runs}] {filename} run={run_number} "
                f"expected_states={dict(states)} raw={len(raw_items)} "
                f"located={len(located)}"
            )

            if args.interval and completed_runs < total_runs:
                await asyncio.sleep(args.interval)

    summarize(results)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(results, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"\nWrote raw diagnostics to {args.output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument(
        "--interval",
        type=float,
        default=float(os.getenv("GATE_SAMPLE_INTERVAL_SECONDS", "10")),
    )
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
