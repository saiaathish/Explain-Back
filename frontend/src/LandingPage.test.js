import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

describe("landing auth states", () => {
  it("renders an accessible error with an enabled retry action", () => {
    const markup = renderToStaticMarkup(
      createElement(LandingPage, {
        authStatus: "error",
        authError: "Anonymous sign-in timed out. Check your connection.",
        busy: false,
        onStart: vi.fn(),
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Anonymous sign-in timed out");
    expect(markup).toContain(">Try again</button>");
    expect(markup).not.toContain("<button disabled");
  });

  it("marks a bounded in-progress operation as busy and disabled", () => {
    const markup = renderToStaticMarkup(
      createElement(LandingPage, {
        authStatus: "authenticating",
        authError: "",
        busy: true,
        onStart: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Starting…");
  });
});
