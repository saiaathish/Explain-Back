# Gemma baseline

## Scope

This is the untuned characterization of `gemma-4-31b-it` as the CI role. The
production role remained `gemini-3.1-flash-lite`. No prompt was changed before
this baseline.

The production comparison and A/B/C isolation results are invalid because every
production-role request was quota-blocked. Their zero scores in
`docs/model-comparison.json` are transport failures, not model-quality results.

## Untuned results

| Measure | Result |
| --- | ---: |
| Original golden | 30/37 (81.1%) |
| Expanded golden | 38/55 (69.1%) |
| Determinism | 5/5 exact final signatures |
| Fluent-unjustified empty arrays | 6/6 |
| Successful pipeline analyses in schema sample | 10/10 |

### Structured output

Across ten independent analyses, each with uncached A/B/C:

| Call | Direct JSON | Parseable after existing repair | Contract-valid |
| --- | ---: | ---: | ---: |
| A | 0/10 | 10/10 | 10/10 |
| B | 0/10 | 10/10 | 10/10 |
| C | 0/10 | 10/10 | 4/10 |

The model returned fenced or wrapped JSON consistently. The existing parser
accepted it, but that is not strict schema conformance. Call C also violated
exact verdict-ID, completeness, or follow-up contracts in 6/10 raw responses,
even though runtime validation/retry allowed all ten analyses to finish.

### Proposition counts

Raw B items, verbatim-located/deduplicated propositions, and final flags matched
for every successful sample. Counts ranged from 2 to 6 propositions per sample.
The notable exception was `14_reverse_order.txt`: B produced and located five
propositions, but Call C failed, so no final flags were emitted.

## Isolation status

The requested A-only, B-only, and C-only runs were executed in fresh
subprocesses to prevent concept-cache contamination. They cannot be interpreted:
the production side was quota-blocked in every hybrid. No confusion matrix or
production-agreement percentage is claimed from this run.

## Baseline conclusion

The untuned model was deterministic and respected the no-invented-justification
sample, but it missed the 32/37 floor and depended on JSON repair. Schema
conformance was therefore the first tuning target.

## Final paced release characterization

After CI-only native schema tuning and explicit provider pacing, the complete
fixture set scored 29/37 on the original ten samples and 37/55 on the expanded
fifteen. This is below both semantic acceptance floors.

Call B was 15/15 direct JSON, schema-valid, and contract-valid. A remaining
Call C completeness failure was traced to an empty `follow_up`, not missing or
duplicate proposition IDs; a CI-only schema constraint fixed the targeted
fixture on its first attempt.

A 17-analysis fresh-cache reliability sequence produced 51 successful direct,
schema-valid, contract-valid responses, but two additional HTTP 503 attempts
occurred in the first 50 calls. End-to-end reliability was therefore 48/50
(96%), below the required 98%.

Gemma is retained for smoke, schema, determinism, and prompt-iteration checks
only. It is not accepted as the production proxy.
