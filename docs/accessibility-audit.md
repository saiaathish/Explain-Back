# Accessibility audit

**Run date:** 2026-07-29  
**Target:** `https://explain-back.vercel.app/` (audit states used a deterministic analysis stub to avoid additional provider traffic)  
**Method:** Playwright Chromium at Desktop Chrome (1280×800), iPhone 14 (390×844), and iPad (768×1024), with `@axe-core/playwright` 4.12.1. The audit exercised empty, preset-loaded, analyzed, calibration-map-visible, revising, and drill-down states.

## Executive result

The fresh audit completed for all three viewports. Axe reported **24 violation instances**: **0 critical**, **9 serious**, and **15 moderate**. Compared with the prior checked-in audit (**42 total: 12 critical, 12 serious, 18 moderate**), the critical `aria-allowed-attr` issue is fixed, and the remaining serious/moderate counts did not worsen.

| Severity | Before | Fresh | Root cause |
| --- | ---: | ---: | --- |
| Critical | 12 | **0** | Fixed: non-green diagnostic spans now have `role="button"`, valid disclosure attributes, and stable controlled tooltip nodes. |
| Serious | 12 | **9** | Remaining `.coverage-chip--partial` and calibration-cell contrast failures. |
| Moderate | 18 | **15** | Remaining `page-has-heading-one` findings in the audited result states. |

The counts are violation **instances**, not unique root causes. The complete raw results, selectors, HTML snippets, and axe help URLs are in `docs/accessibility-audit.json`.

## Fixed critical finding — diagnostic disclosure semantics

`frontend/src/Overlay.jsx` now renders each non-green diagnostic as a keyboard-operable `role="button"` with `tabindex="0"`, `aria-expanded`, and `aria-controls`. Its `role="tooltip"` feedback card remains mounted with the controlled ID and uses the native `hidden` state while closed. Green highlights remain non-interactive and do not receive disclosure attributes.

The focused regression spec `frontend/e2e/diagnostic-disclosure.pw.js` passed on Desktop Chrome and iPhone 14. It verified:

- closed `aria-expanded="false"` and an existing controlled tooltip ID;
- Enter and Space toggling;
- Escape closing while retaining focus;
- desktop hover open/close;
- iPhone tap open/close.

No `aria-allowed-attr` violation appeared in the fresh axe output.

## Remaining serious finding — contrast

Axe still identifies three normal-text contrast failures in result states:

- `.coverage-chip--partial`: **4.23:1**, below the 4.5:1 threshold (`#8a6500` on `#ebe5d4`);
- `.calibration-cell--solid > small`: **4.36:1**, below 4.5:1 (`#6b6862` on `#dee6df`);
- `.calibration-cell--danger > small`: **4.23:1**, below 4.5:1 (`#6b6862` on `#efddda`).

These were not changed as part of the morning fix. Diagnostic-state contrast measurement was attempted against computed browser colors; Chromium returned CSS Color 4 `oklab(...)` values for the `color-mix()` wash backgrounds, so unavailable ratios are recorded rather than invented.

## Remaining moderate finding — missing level-one heading

The brand is rendered as a `span` rather than an `h1`, so axe reports `page-has-heading-one` in the audited states. This was not changed as part of the morning fix.

## Keyboard-only walkthrough

The desktop keyboard pass successfully:

1. reached and activated the Biology preset;
2. reached and activated **Check my explanation**;
3. reached a diagnostic, opened its source note with Enter, and closed it with Escape;
4. reached **Revise your explanation**, entered the corrected explanation, and submitted it;
5. reached the rendered diff strip after revision.

The iPhone and iPad records mark the keyboard walkthrough as not-run because they exercise touch viewports. Focus remained on the diagnostic after Escape.

## Screen reader

A usable VoiceOver/NVDA/CLI screen-reader session was not exposed by this environment, so no screen-reader result is claimed. A dedicated VoiceOver pass remains recommended.

## Status

The critical ARIA finding is verified fixed. Remaining contrast and heading findings are preserved for separate follow-up; they did not worsen in the fresh audit.
