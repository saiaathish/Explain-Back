import { useEffect, useRef, useState } from "react";

/*
 * The reference design is a Next.js + Tailwind + framer-motion component. This
 * project is Vite + React with a hand-built editorial stylesheet, so the ideas
 * are ported rather than the code: an orbiting ripple aside, staged reveals, and
 * one primary action. Motion is CSS only, so it costs no new dependency and the
 * existing reduced-motion rule already disables it.
 */

const ORBITS = [
  { radius: 96, duration: 34, delay: 0, label: "green" },
  { radius: 148, duration: 46, delay: -12, label: "amber", reverse: true },
  { radius: 208, duration: 58, delay: -26, label: "red" },
];

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="login-google-mark" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        fill="#4285f4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        fill="#34a853"
      />
      <path
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        fill="#fbbc05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        fill="#ea4335"
      />
    </svg>
  );
}

/* Staged reveal, in place of the reference's BoxReveal wrapper. */
function Reveal({ children, order = 0, as: Tag = "div", className = "" }) {
  return (
    <Tag
      className={`login-reveal ${className}`.trim()}
      style={{ "--reveal-order": order }}
    >
      {children}
    </Tag>
  );
}

function OrbitAside() {
  return (
    <aside aria-hidden="true" className="login-aside">
      <div className="login-ripple">
        {[0, 1, 2, 3].map((ring) => (
          <span
            className="login-ripple-ring"
            key={ring}
            style={{ "--ring": ring }}
          />
        ))}
      </div>
      {ORBITS.map((orbit) => (
        <div
          className={`login-orbit${orbit.reverse ? " login-orbit--reverse" : ""}`}
          key={orbit.label}
          style={{
            "--orbit-radius": `${orbit.radius}px`,
            "--orbit-duration": `${orbit.duration}s`,
            "--orbit-delay": `${orbit.delay}s`,
          }}
        >
          <span className={`login-orbit-dot login-orbit-dot--${orbit.label}`} />
        </div>
      ))}
      <p className="login-aside-caption">
        Explain it.
        <span>See what holds up.</span>
      </p>
    </aside>
  );
}

export default function LoginScreen({
  authError,
  busy,
  onBack,
  onSignInWithGoogle,
  settling,
}) {
  const headingRef = useRef(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const label = settling
    ? "Signing you in…"
    : pressed || busy
      ? "Taking you to Google…"
      : "Continue with Google";

  return (
    <div className="login-shell">
      <OrbitAside />

      <main className="login-main">
        <section className="login-panel" aria-labelledby="login-title">
          <Reveal order={0}>
            <p className="login-eyebrow">Explain-Back</p>
          </Reveal>

          <Reveal order={1}>
            <h1 id="login-title" ref={headingRef} tabIndex={-1}>
              Sign in to start explaining
            </h1>
          </Reveal>

          <Reveal order={2}>
            <p className="login-lede">
              An account keeps your sources, every explanation attempt, and the
              gaps you are still working on. Google is the only sign-in — there
              is no password to create or remember.
            </p>
          </Reveal>

          <Reveal order={3}>
            <button
              aria-busy={busy || undefined}
              className="primary login-google"
              disabled={busy}
              onClick={() => {
                setPressed(true);
                onSignInWithGoogle();
              }}
              type="button"
            >
              <GoogleMark />
              {label}
            </button>
          </Reveal>

          {settling && (
            <p className="login-settling" role="status">
              Finishing sign-in. You will land straight in your workspace.
            </p>
          )}

          {authError && (
            <p className="login-error" role="alert">
              {authError}
            </p>
          )}

          <Reveal order={4}>
            <p className="login-disclosure">
              Signing in stores your source material, your explanation attempts,
              and your review marks against your account. Only you can read them.
            </p>
          </Reveal>

          {onBack && (
            <Reveal order={5}>
              <button className="secondary login-back" onClick={onBack} type="button">
                Back
              </button>
            </Reveal>
          )}
        </section>
      </main>
    </div>
  );
}
