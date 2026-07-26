import asyncio
import json
import os
from pathlib import Path

from backend.main import analyze
from backend.schemas import AnalyzeRequest

ROOT = Path(__file__).parents[1]


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
    sample_states: dict[str, list[str]] = {}
    for filename, expected_items in golden.items():
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
            print(
                f"{'PASS' if passed else 'FAIL'} {filename} "
                f"{expected['state']:6s} {expected['span']!r} "
                f"actual={actual.state if actual else 'missing'}"
            )

    score = matched / total if total else 0
    all_states = {state for states in sample_states.values() for state in states}
    hedged_red = sample_states.get("04_hedged.txt", []).count("red")
    correct_states = sample_states.get("06_correct.txt", [])
    unjustified_states = sample_states.get("01_fluent_unjustified.txt", [])
    print(f"\nGolden agreement: {matched}/{total} = {score:.1%}")
    print(f"States observed: {sorted(all_states)}")
    if score < 0.80:
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
