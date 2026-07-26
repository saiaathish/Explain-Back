import json
from pathlib import Path

import numpy as np

from backend.align import embed


def main() -> None:
    path = Path(__file__).with_name("pairs.json")
    pairs = json.loads(path.read_text(encoding="utf-8"))
    vectors = embed(
        [text for pair in pairs for text in (pair["claim"], pair["concept"])]
    )
    similarities: dict[str, list[float]] = {"clear": [], "partial": [], "off": []}
    for index, pair in enumerate(pairs):
        claim_vector = vectors[index * 2]
        concept_vector = vectors[index * 2 + 1]
        similarities[pair["label"]].append(float(claim_vector @ concept_vector))

    for label, values in similarities.items():
        ordered = sorted(values)
        print(
            f"{label:8s} n={len(ordered):2d} min={ordered[0]:.3f} "
            f"med={np.median(ordered):.3f} max={ordered[-1]:.3f}"
        )
    # Relevance and completeness overlap in embedding space. Keep low just above
    # observed off-topic pairs, while high follows the requested 10th percentile
    # of clear matches. Justification spans enforce completeness downstream.
    low = min(
        float(min(similarities["clear"])),
        float(max(similarities["off"])) + 0.002,
    )
    high = max(
        low + 0.01,
        float(np.percentile(similarities["clear"], 10)),
    )
    print(f"\nSuggested: T_HIGH={high:.3f} T_LOW={low:.3f}")


if __name__ == "__main__":
    main()
