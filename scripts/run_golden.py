import asyncio
import json
import os
from pathlib import Path

from backend.main import analyze
from backend.schemas import AnalyzeRequest

ROOT = Path(__file__).parents[1]
ORIGINAL_FILES = {
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
}
ORIGINAL_BASELINE_MATCHED = 32
EXPANDED_BASELINE_SCORE = 0.80


def overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


async def main() -> int:
    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL"):
        print("GATE 3 BLOCKED: set LLM_API_KEY and LLM_MODEL for live golden evidence.")
        return 2
    source = (ROOT / "samples" / "source_sodium_pump.txt").read_text(
        encoding="utf-8"
    ).strip()
    golden = json.loads(
        (ROOT / "samples" / "golden.json").read_text(encoding="utf-8")
    )
    matched = 0
    total = 0
    original_matched = 0
    original_total = 0
    sample_states: dict[str, list[str]] = {}
    sample_interval = max(
        0.0, float(os.getenv("GATE_SAMPLE_INTERVAL_SECONDS", "0"))
    )
    samples = list(golden.items())
    for sample_index, (filename, expected_items) in enumerate(samples, start=1):
        explanation = (
            ROOT / "samples" / "explanations" / filename
        ).read_text(encoding="utf-8").strip()
        response = await analyze(
            AnalyzeRequest(source=source, explanation=explanation)
        )
        sample_states[filename] = [flag.state for flag in response.flags]
        for expected in expected_items:
            total += 1
            start = explanation.index(expected["span"])
            end = start + len(expected["span"])
            candidates = [
                flag
                for flag in response.flags
                if overlap(start, end, flag.start, flag.end) / (end - start) >= 0.5
            ]
            actual = max(
                candidates,
                key=lambda flag: overlap(start, end, flag.start, flag.end),
                default=None,
            )
            passed = actual is not None and actual.state == expected["state"]
            matched += int(passed)
            if filename in ORIGINAL_FILES:
                original_total += 1
                original_matched += int(passed)
            print(
                f"{'PASS' if passed else 'FAIL'} {filename} "
                f"{expected['state']:6s} {expected['span']!r} "
                f"actual={actual.state if actual else 'missing'}"
            )
        if sample_interval and sample_index < len(samples):
            await asyncio.sleep(sample_interval)

    score = matched / total if total else 0
    original_score = original_matched / original_total if original_total else 0
    all_states = {state for states in sample_states.values() for state in states}
    hedged_red = sample_states.get("04_hedged.txt", []).count("red")
    correct_states = sample_states.get("06_correct.txt", [])
    unjustified_states = sample_states.get("01_fluent_unjustified.txt", [])
    print(
        f"\nOriginal golden agreement: "
        f"{original_matched}/{original_total} = {original_score:.1%}"
    )
    print(f"Expanded golden agreement: {matched}/{total} = {score:.1%}")
    print(f"States observed: {sorted(all_states)}")
    if original_matched < ORIGINAL_BASELINE_MATCHED:
        print(
            "FAIL: original golden regressed below "
            f"{ORIGINAL_BASELINE_MATCHED}/{original_total}."
        )
        return 1
    if score < EXPANDED_BASELINE_SCORE:
        print(
            "FAIL: expanded golden regressed below "
            f"{EXPANDED_BASELINE_SCORE:.0%}."
        )
        return 1
    if hedged_red:
        print("FAIL: 04_hedged.txt produced red.")
        return 1
    if correct_states.count("green") <= len(correct_states) / 2:
        print("FAIL: 06_correct.txt is not majority green.")
        return 1
    if unjustified_states.count("yellow") <= len(unjustified_states) / 2:
        print("FAIL: 01_fluent_unjustified.txt is not majority yellow.")
        return 1
    if all_states != {"green", "yellow", "red", "grey"}:
        print("FAIL: all four states did not appear.")
        return 1
    print("GATE 3 PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
