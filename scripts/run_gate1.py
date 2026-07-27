import asyncio
import json
import os
from pathlib import Path

from backend.extract import extract_propositions
from backend.llm import (
    LLMConfigurationError,
    active_model,
    active_role,
    is_configured,
)

ROOT = Path(__file__).parents[1]
SOURCE = (ROOT / "samples" / "source_sodium_pump.txt").read_text(
    encoding="utf-8"
).strip()


async def main() -> int:
    os.environ["LLM_ROLE"] = os.getenv("GATE1_LLM_ROLE", "ci").strip().lower()
    if not is_configured(call="b"):
        print("GATE 1 BLOCKED: configure the selected LLM role.")
        return 2
    print(
        "Gate 1 configuration: "
        f"B={active_model('b')} ({active_role('b')})"
    )
    files = sorted((ROOT / "samples" / "explanations").glob("*.txt"))
    runs = files + [files[0]]
    request_interval = max(
        0.0, float(os.getenv("GATE_REQUEST_INTERVAL_SECONDS", "0"))
    )
    output: dict[str, list[dict]] = {}
    for run_index, path in enumerate(runs, start=1):
        explanation = path.read_text(encoding="utf-8").strip()
        try:
            propositions = await extract_propositions(SOURCE, explanation)
        except LLMConfigurationError as exc:
            print(f"GATE 1 BLOCKED: {exc}")
            return 2
        for proposition in propositions:
            assert (
                explanation[proposition.claim_start : proposition.claim_end]
                == proposition.claim_span
            )
            for span, (start, end) in zip(
                proposition.justification_spans,
                proposition.justification_offsets,
            ):
                assert explanation[start:end] == span
        key = f"{path.name}#run{run_index}" if path == files[0] else path.name
        output[key] = [item.model_dump() for item in propositions]
        print(f"\n{key}\n{json.dumps(output[key], indent=2)}")
        if request_interval and run_index < len(runs):
            await asyncio.sleep(request_interval)

    first_runs = [value for key, value in output.items() if key.startswith("01_")]
    if any(item["justification_spans"] for run in first_runs for item in run):
        print("GATE 1 FAIL: fluent-unjustified sample gained a justification.")
        return 1
    correct = output["06_correct.txt"]
    if not any(item["justification_spans"] for item in correct):
        print("GATE 1 FAIL: correct sample has no extracted justifications.")
        return 1
    print("\nGATE 1 PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
