import json
from pathlib import Path


def test_golden_spans_are_verbatim_and_all_states_are_represented() -> None:
    root = Path(__file__).parents[1]
    golden = json.loads(
        (root / "samples" / "golden.json").read_text(encoding="utf-8")
    )
    assert len(golden) == 15
    states = set()
    for filename, items in golden.items():
        explanation = (
            root / "samples" / "explanations" / filename
        ).read_text(encoding="utf-8")
        assert items
        for item in items:
            assert item["span"] in explanation
            states.add(item["state"])
    assert states == {"green", "yellow", "red", "grey"}
