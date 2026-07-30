import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function AuthConsumer() {
  const auth = useAuth();
  return createElement(
    "span",
    null,
    `${auth.authStatus}:${auth.isAnonymous ? "anonymous" : "identified"}`,
  );
}

describe("AuthContext", () => {
  it("makes the provider-owned auth state available to the wrapped app", () => {
    const markup = renderToStaticMarkup(
      createElement(
        AuthProvider,
        {
          value: {
            authStatus: "authenticated",
            isAnonymous: true,
          },
        },
        createElement(AuthConsumer),
      ),
    );

    expect(markup).toContain("authenticated:anonymous");
  });

  it("fails loudly when auth state is consumed outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(AuthConsumer))).toThrow(
      /within an AuthProvider/i,
    );
  });
});
