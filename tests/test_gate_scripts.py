import sys
from types import SimpleNamespace

from scripts import run_determinism, run_golden
from tests import model_compare


def test_model_compare_accepts_explicit_provider_pacing(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["model_compare.py", "--pace-seconds", "7.5"],
    )

    assert model_compare.parse_args().pace_seconds == 7.5


def test_release_gate_thresholds_match_hardening_brief() -> None:
    assert run_golden.ORIGINAL_BASELINE_MATCHED == 32
    assert run_golden.EXPANDED_BASELINE_SCORE == 0.80
    assert run_determinism.DETERMINISM_RUNS == 5
    assert run_determinism.WARM_ANALYSIS_LIMIT_SECONDS == 8.0


def test_determinism_signature_detects_state_or_span_drift() -> None:
    reference = [
        SimpleNamespace(start=0, end=5, state="green"),
        SimpleNamespace(start=8, end=12, state="yellow"),
    ]
    same_different_order = list(reversed(reference))
    state_drift = [
        SimpleNamespace(start=0, end=5, state="yellow"),
        SimpleNamespace(start=8, end=12, state="yellow"),
    ]
    span_drift = [
        SimpleNamespace(start=0, end=6, state="green"),
        SimpleNamespace(start=8, end=12, state="yellow"),
    ]

    assert run_determinism.signature(reference) == run_determinism.signature(
        same_different_order
    )
    assert run_determinism.signature(reference) != run_determinism.signature(
        state_drift
    )
    assert run_determinism.signature(reference) != run_determinism.signature(
        span_drift
    )


def test_model_compare_schema_requires_verbatim_call_b_spans() -> None:
    valid = [
        {
            "id": "P1",
            "claim_span": "Claim.",
            "justification_spans": [],
            "type": "descriptive",
            "certainty": "high",
        }
    ]
    metrics = model_compare._shape_metrics(
        "b",
        valid,
        "Source.",
        "Claim.",
        [],
    )
    invalid = model_compare._shape_metrics(
        "b",
        [{**valid[0], "claim_span": "Paraphrased."}],
        "Source.",
        "Claim.",
        [],
    )

    assert metrics["shape_valid"]
    assert not invalid["shape_valid"]


def test_model_compare_counts_unmatched_red_as_safety_transition() -> None:
    production = {
        "results": [
            {
                "file": "sample.txt",
                "run": 1,
                "signature": [(0, 5, "green")],
            }
        ]
    }
    candidate = {
        "results": [
            {
                "file": "sample.txt",
                "run": 1,
                "signature": [(0, 5, "green"), (8, 12, "red")],
            }
        ]
    }

    result = model_compare._agreement(production, candidate)

    assert result["matched"] == 1
    assert result["total"] == 2
    assert result["red_transitions_not_in_production"] == 1
    assert result["confusion"]["missing->red"] == 1
