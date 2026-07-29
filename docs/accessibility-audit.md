# Accessibility audit

**Run date:** 2026-07-29  
**Target:** `https://explain-back.vercel.app/`  
**Method:** Playwright Chromium at Desktop Chrome (1280×800), iPhone 14 (390×844), and iPad (768×1024), with `@axe-core/playwright` 4.12.1. No application code or styles were changed while auditing.

## Executive result

The automated audit completed for all three viewports and all requested reachable states. Across the 3 viewport runs, axe reported **42 violation instances**: **12 critical**, **12 serious**, and **18 moderate**. The same findings recur across viewports and states; these are instances, not 42 unique root causes.

| Severity | Count | Root cause |
| --- | ---: | --- |
| Critical | 12 | `aria-expanded` is applied to diagnostic `<span>` elements, which axe considers an unsupported ARIA attribute for that element. Reproduced in analyzed, calibration-map-visible, revising, and drill-down-open states (3 viewport instances per state). |
| Serious | 12 | Color contrast failures on `.coverage-chip--partial` and the small labels in the solid/danger calibration cells. Reproduced in the same 4 result states across 3 viewports. |
| Moderate | 18 | The page has no level-one heading (`page-has-heading-one`) in all 6 audited states across 3 viewports. |

### State matrix

Each viewport produced the same state-level pattern:

- **Empty:** one moderate `page-has-heading-one` violation.
- **Preset-loaded:** one moderate `page-has-heading-one` violation.
- **Analyzed:** one critical `aria-allowed-attr`, one serious `color-contrast`, and one moderate `page-has-heading-one` violation record (the critical record contains five diagnostic spans; the contrast record contains three nodes).
- **Calibration map visible:** same three violation IDs as analyzed.
- **Revising:** same three violation IDs as analyzed.
- **Drill-down open:** same three violation IDs as analyzed.

The complete raw results, selectors, HTML snippets, and axe help URLs are in `docs/accessibility-audit.json`.

## Findings

### Critical — unsupported ARIA attribute

`frontend/src/Overlay.jsx` renders interactive diagnostic spans with `aria-expanded="false"` even when no tooltip is open. Axe flags this as `aria-allowed-attr` because `aria-expanded` is not valid on a generic span without an applicable widget role. The finding occurs on the yellow, red, and grey diagnostic spans in each result state. The span is keyboard reachable and the note opens/closes, but the semantic contract needs a deliberate follow-up fix rather than an audit-time workaround.

### Serious — contrast

Axe identified three normal-text contrast failures in each result state:

- `.coverage-chip--partial`: **4.23:1**, below the 4.5:1 normal-text threshold (`#8a6500` on `#ebe5d4`).
- `.calibration-cell--solid > small`: **4.36:1**, below 4.5:1 (`#6b6862` on `#dee6df`).
- `.calibration-cell--danger > small`: **4.23:1**, below 4.5:1 (`#6b6862` on `#efddda`).

The requested diagnostic-state contrast measurement was also attempted against actual computed browser colors. The foreground and page colors were available, but Chromium returned CSS Color 4 `oklab(...)` strings for the `color-mix()` wash backgrounds. The audit records those actual values and marks the calculated diagnostic ratios unavailable rather than converting or inventing values. The four states were available as follows: initial green unavailable, initial yellow/red/grey available, revised green available, and revised yellow/red/grey unavailable because the corrected result was all green.

### Moderate — missing level-one heading

The brand is rendered as a `span` rather than an `h1`, so axe reports `page-has-heading-one` in empty, preset-loaded, analyzed, calibration, revising, and drill-down states. This is a semantic issue only; no visual fix was applied.

## Keyboard-only walkthrough

The desktop keyboard pass used Tab, Shift+Tab-equivalent navigation where needed, Enter, Space/Escape behavior, and no mouse. It successfully:

1. Reached and activated the Biology preset.
2. Reached and activated **Check my explanation**.
3. Reached a diagnostic span, opened its source note with Enter, and closed it with Escape.
4. Reached **Revise your explanation**, entered the corrected explanation, and submitted the revision.
5. Reached the rendered diff strip after revision.

The recorded focus trace is in `docs/accessibility-audit.json`. One observation is worth follow-up: after activating the preset and after activating submit/revise, focus returned to `body` because the application’s effects focus the result region rather than restoring the triggering button. This did not trap focus, but it causes a longer subsequent Tab path. The diagnostic span remained focused after Escape, which is appropriate.

The keyboard walkthrough was run on Desktop Chrome. The iPhone and iPad records deliberately mark the keyboard walkthrough as not-run because the required keyboard-only interaction is a desktop input modality; their axe and contrast passes still completed.

## Screen reader

A usable VoiceOver/NVDA/CLI screen-reader session was not exposed by this environment, so no screen-reader result is claimed. The custom diagnostic tooltip and diff strip should receive a dedicated VoiceOver pass before shipping, especially after deciding how to repair the `aria-expanded` finding.

## Status

This is an audit-only report. No violations were fixed. The findings are preserved for a human decision about what to address before the deadline.
