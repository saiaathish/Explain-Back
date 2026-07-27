import asyncio
import os
import time
from pathlib import Path

from backend.main import _concept_cache, analyze
from backend.schemas import AnalyzeRequest, Flag

ROOT = Path(__file__).parents[1]
DETERMINISM_RUNS = 5
WARM_ANALYSIS_LIMIT_SECONDS = 8.0


def overlap(first: Flag, second: Flag) -> int:
    return max(0, min(first.end, second.end) - max(first.start, second.start))


def signature(flags: list[Flag]) -> list[tuple[int, int, str]]:
    return sorted((flag.start, flag.end, flag.state) for flag in flags)


def compare(first: list[Flag], second: list[Flag]) -> tuple[int, int]:
    candidates = sorted(
        (
            (overlap(left, right), left_index, right_index)
            for left_index, left in enumerate(first)
            for right_index, right in enumerate(second)
        ),
        reverse=True,
    )
    used_left: set[int] = set()
    used_right: set[int] = set()
    matched_states = 0
    for shared, left_index, right_index in candidates:
        if not shared or left_index in used_left or right_index in used_right:
            continue
        left = first[left_index]
        right = second[right_index]
        if shared / min(left.end - left.start, right.end - right.start) < 0.5:
            continue
        used_left.add(left_index)
        used_right.add(right_index)
        matched_states += int(left.state == right.state)
        print(
            f"{left.prop_id}:{left.state} ↔ {right.prop_id}:{right.state} "
            f"overlap={shared}"
        )
    return matched_states, max(len(first), len(second))


async def main() -> int:
    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL"):
        print("DETERMINISM BLOCKED: set LLM_API_KEY and LLM_MODEL.")
        return 2
    source = (ROOT / "samples" / "source_sodium_pump.txt").read_text(
        encoding="utf-8"
    ).strip()
    filename = os.getenv("DETERMINISM_SAMPLE", "06_correct.txt")
    explanation = (ROOT / "samples" / "explanations" / filename).read_text(
        encoding="utf-8"
    ).strip()
    request = AnalyzeRequest(source=source, explanation=explanation)
    _concept_cache.clear()
    interval = max(
        0.0, float(os.getenv("DETERMINISM_INTERVAL_SECONDS", "0"))
    )
    responses = []
    timings = []
    for run_number in range(1, DETERMINISM_RUNS + 1):
        started_at = time.perf_counter()
        responses.append(await analyze(request))
        elapsed = time.perf_counter() - started_at
        timings.append(elapsed)
        print(f"Run {run_number}/{DETERMINISM_RUNS}: {elapsed:.3f}s")
        if run_number < DETERMINISM_RUNS and interval:
            await asyncio.sleep(interval)

    if any(not response.flags for response in responses):
        print("DETERMINISM FAIL: one or more runs returned no diagnostics.")
        return 1

    reference = responses[0]
    matching_runs = 1
    for run_number, response in enumerate(responses[1:], start=2):
        matched, total = compare(reference.flags, response.flags)
        agreement = matched / total if total else 0.0
        exact = signature(reference.flags) == signature(response.flags)
        matching_runs += int(exact)
        print(
            f"Run {run_number} state agreement: "
            f"{matched}/{total} = {agreement:.1%}"
        )

    slow_warm_runs = [
        (run_number, elapsed)
        for run_number, elapsed in enumerate(timings[1:], start=2)
        if elapsed >= WARM_ANALYSIS_LIMIT_SECONDS
    ]
    print(
        f"Deterministic runs: {matching_runs}/{DETERMINISM_RUNS} = "
        f"{matching_runs / DETERMINISM_RUNS:.1%}"
    )
    if matching_runs != DETERMINISM_RUNS:
        print("DETERMINISM FAIL: state or span pattern changed.")
        return 1
    if slow_warm_runs:
        details = ", ".join(
            f"run {run_number} {elapsed:.3f}s"
            for run_number, elapsed in slow_warm_runs
        )
        print(
            "DETERMINISM FAIL: warm analysis reached or exceeded "
            f"{WARM_ANALYSIS_LIMIT_SECONDS:.1f}s ({details})."
        )
        return 1
    print("DETERMINISM PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
