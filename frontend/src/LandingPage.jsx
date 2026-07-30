import Overlay from "./Overlay";

const PREVIEW_EXPLANATION =
  "The sodium-potassium pump uses ATP. It moves potassium out and sodium into the cell. These gradients support membrane potential.";

function previewFlag(propId, state, claim, details) {
  const start = PREVIEW_EXPLANATION.indexOf(claim);
  return {
    prop_id: propId,
    state,
    start,
    end: start + claim.length,
    concept_id: propId,
    ...details,
  };
}

const PREVIEW_FLAGS = [
  previewFlag("energy", "green", "The sodium-potassium pump uses ATP.", {
    anchor: "The pump uses energy from ATP.",
    hint: "Keep the energy source explicit.",
  }),
  previewFlag(
    "transport",
    "red",
    "It moves potassium out and sodium into the cell.",
    {
      anchor: "Three sodium ions leave while two potassium ions enter.",
      hint: "Reverse the ion directions and include the 3:2 ratio.",
      misconception: "The ion directions are reversed.",
      refutation: "The pump exports sodium and imports potassium.",
    },
  ),
  previewFlag(
    "gradients",
    "yellow",
    "These gradients support membrane potential.",
    {
      anchor: "The ion gradients help establish the membrane potential.",
      hint: "Explain how unequal ion concentrations create the voltage difference.",
    },
  ),
];

export default function LandingPage({
  onStart,
  authStatus,
  authError,
  busy,
}) {
  const buttonLabel =
    authStatus === "restoring"
      ? "Restoring your session…"
      : authStatus === "authenticating"
        ? "Starting…"
        : authError
          ? "Try again"
          : "Sign in to start";

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <p className="brand" aria-label="Explain-Back">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            Explain<span className="brand-accent">-</span>Back
          </span>
        </p>
      </header>

      <main className="landing-main">
        <section className="landing-copy" aria-labelledby="landing-title">
          <p className="landing-eyebrow">Learn by explaining</p>
          <h1 id="landing-title">
            Every AI tutor explains to you.
            <span>This one makes you explain.</span>
          </h1>
          <p className="landing-lede">
            Explain a source in your own words. Explain-Back marks what holds up,
            what needs a reason, and what contradicts the source.
          </p>
          <p className="landing-evidence">
            In a meta-analysis, teaching after preparing to teach improved domain
            learning by about half a standard deviation (
            <a
              href="https://doi.org/10.1111/jpr.12221"
              rel="noreferrer"
              target="_blank"
            >
              Hedges&apos; g = 0.56
            </a>
            ).
          </p>
          <button
            aria-busy={busy || undefined}
            className="primary landing-cta"
            disabled={busy}
            onClick={onStart}
            type="button"
          >
            {buttonLabel}
          </button>
          <p className="landing-assurance">
            Google sign-in. No password to create.
          </p>
          {authError && (
            <p className="landing-auth-error" role="alert">
              {authError}
            </p>
          )}
          <p className="landing-auth-disclosure">
            An account is required. Your source material, every explanation
            attempt, and your review marks are saved to it and readable only by
            you, on any device you sign in from.
          </p>
        </section>

        <figure className="landing-preview">
          <div className="landing-preview-heading">
            <span>Actual diagnostic overlay</span>
            <span aria-hidden="true">Explain → inspect → revise</span>
          </div>
          <Overlay
            explanation={PREVIEW_EXPLANATION}
            flags={PREVIEW_FLAGS}
            revealDelay={150}
            revealDuration={900}
          />
          <figcaption>
            Green holds up. Amber needs a reason. Red conflicts with the source.
            Tap a marked sentence to inspect the evidence.
          </figcaption>
        </figure>
      </main>

      <footer className="landing-footer">
        <a
          href="https://github.com/saiaathish/Explain-Back"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
