import asyncio
import os
import time
from collections import Counter
from pathlib import Path

from backend.main import analyze
from backend.schemas import AnalyzeRequest


ROOT = Path(__file__).parents[1]
CASES = (
    ("supply_demand_strong", "source_supply_demand.txt"),
    ("supply_demand_flawed", "source_supply_demand.txt"),
    ("photosynthesis_strong", "source_photosynthesis.txt"),
    ("photosynthesis_flawed", "source_photosynthesis.txt"),
)


async def main() -> int:
    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL"):
        print(
            "CROSS-SUBJECT BLOCKED: set LLM_API_KEY and LLM_MODEL "
            "for live evidence."
        )
        return 2

    summary_only = os.getenv("CROSS_SUBJECT_SUMMARY_ONLY") == "1"
    requested_case = os.getenv("CROSS_SUBJECT_CASE", "").strip()
    selected_cases = [
        case for case in CASES if not requested_case or case[0] == requested_case
    ]
    if not selected_cases:
        print(f"CROSS-SUBJECT BLOCKED: unknown case {requested_case!r}.")
        return 2

    for explanation_name, source_name in selected_cases:
        source = (ROOT / "samples" / source_name).read_text(
            encoding="utf-8"
        ).strip()
        explanation = (
            ROOT / "samples" / "explanations" / f"{explanation_name}.txt"
        ).read_text(encoding="utf-8").strip()
        started_at = time.perf_counter()
        response = await analyze(
            AnalyzeRequest(source=source, explanation=explanation)
        )
        elapsed = time.perf_counter() - started_at
        state_counts = Counter(flag.state for flag in response.flags)
        invalid_spans = [
            flag.prop_id
            for flag in response.flags
            if not (0 <= flag.start < flag.end <= len(explanation))
        ]

        print(f"\nCASE {explanation_name} ({elapsed:.2f}s)")
        print(
            f"SUMMARY propositions={len(response.flags)} "
            f"states={dict(sorted(state_counts.items()))} "
            f"invalid_spans={invalid_spans}"
        )
        if not summary_only:
            print(
                "CONCEPTS "
                + " | ".join(
                    f"{concept.id}: {concept.label}"
                    for concept in response.concepts
                )
            )
            for flag in response.flags:
                span = explanation[flag.start : flag.end]
                print(
                    f"FLAG {flag.state:6s} {span!r} "
                    f"concept={flag.concept_id or '-'} "
                    f"similarity={flag.similarity:.3f}"
                )
        print(
            "COVERAGE "
            f"covered={response.coverage.covered} "
            f"partial={response.coverage.partial} "
            f"missing={response.coverage.missing}"
        )
        print(f"FOLLOW_UP {response.follow_up}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
