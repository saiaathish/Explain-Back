import asyncio
import os
from pathlib import Path

from backend.main import _concept_cache, analyze
from backend.schemas import AnalyzeRequest, Flag

ROOT = Path(__file__).parents[1]


def overlap(first: Flag, second: Flag) -> int:
    return max(0, min(first.end, second.end) - max(first.start, second.start))


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
    first = await analyze(request)
    second = await analyze(request)
    matched, total = compare(first.flags, second.flags)
    agreement = matched / total if total else 0.0
    print(f"State agreement: {matched}/{total} = {agreement:.1%}")
    if agreement < 0.90:
        print("DETERMINISM FAIL")
        return 1
    print("DETERMINISM PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
