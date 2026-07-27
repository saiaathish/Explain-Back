from types import SimpleNamespace

from scripts import run_determinism, run_golden


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
