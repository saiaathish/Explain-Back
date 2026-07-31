/**
 * Explain-Back Main React Application & Routing Container
 * 
 * Configures top-level React Router routes, authentication provider context,
 * protected layout shell framing, and multi-step session step guards.
 */

import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import AppLayout from "./layout/AppLayout";
import LandingPage from "./LandingPage";
import { clearLearningData } from "./learningData";
import LoginScreen from "./LoginScreen";
import AnalyzingStep from "./pages/AnalyzingStep";
import ConfidenceStep from "./pages/ConfidenceStep";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import ProfilePage from "./pages/ProfilePage";
import RecordStep from "./pages/RecordStep";
import ResultsPage from "./pages/ResultsPage";
import ReviewPage from "./pages/ReviewPage";
import SourceStep from "./pages/SourceStep";
import { furthestStep, stepIsReachable } from "./session/draft";
import { SessionProvider, useSession } from "./session/SessionProvider";
import { browserAuth } from "./supabase";

const AUTH_OPERATION_TIMEOUT_MS = 10_000;

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      const error = new Error(message);
      error.name = "AuthTimeoutError";
      reject(error);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function singleFlight(ref, owner, task) {
  if (ref.current?.owner === owner) return ref.current.promise;

  const entry = { owner, promise: null };
  entry.promise = Promise.resolve()
    .then(task)
    .finally(() => {
      if (ref.current === entry) ref.current = null;
    });
  ref.current = entry;
  return entry.promise;
}

function boundedSingleFlight(ref, owner, task, timeoutMs, message) {
  return withTimeout(singleFlight(ref, owner, task), timeoutMs, message);
}

function shouldOpenWorkspaceOnSessionRestore(session) {
  return Boolean(
    session?.access_token && session?.user?.is_anonymous === false,
  );
}

/*
 * Supabase reports a failed sign-in on the callback URL, not to the call that
 * started it. Without reading this, a refused sign-in silently returns to the
 * page with no explanation and the learner retries the same failure forever.
 */
function readOAuthCallbackError(search = "", hash = "") {
  const params = new URLSearchParams(String(search).replace(/^\?/, ""));
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ""));
  const read = (name) => params.get(name) || fragment.get(name) || "";
  const code = read("error_code");
  if (!read("error") && !code) return null;

  return {
    code: code || "oauth_error",
    message:
      read("error_description").replace(/\+/g, " ") ||
      "Google sign-in did not complete. Try again.",
  };
}

/*
 * A provider return carries either an authorization code or a token fragment.
 * Recognising it is what keeps the landing page from flashing between Google
 * and the workspace while the session is still being exchanged.
 */
function isOAuthReturn(search = "", hash = "") {
  const params = new URLSearchParams(String(search).replace(/^\?/, ""));
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ""));
  return Boolean(
    params.get("code") ||
      fragment.get("access_token") ||
      fragment.get("refresh_token"),
  );
}

function AuthStateProvider({ auth, children }) {
  const [entered, setEntered] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("restoring");
  const [authError, setAuthError] = useState("");
  const mountedRef = useRef(true);
  const signInPromiseRef = useRef(null);
  const signInAttemptRef = useRef(0);
  const authActionRef = useRef(null);
  const refreshPromiseRef = useRef(null);
  const [signInBusy, setSignInBusy] = useState(false);
  /* A provider return is still in flight, so never show the landing page. */
  const [returningFromProvider, setReturningFromProvider] = useState(() =>
    isOAuthReturn(globalThis.location?.search, globalThis.location?.hash),
  );

  /* Read the callback's verdict once, then clean it out of the address bar. */
  useEffect(() => {
    const location = globalThis.location;
    const failure = readOAuthCallbackError(location?.search, location?.hash);
    if (!failure) return;
    setAuthError(failure.message);
    setReturningFromProvider(false);
    /* Only a failed return is cleaned here. A successful one still carries the
     * authorization code, and the Supabase client needs it to get a session —
     * stripping it first leaves the learner stranded on the login screen. */
    if (globalThis.history?.replaceState && location?.pathname) {
      globalThis.history.replaceState(null, "", location.pathname);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      signInAttemptRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let authEventVersion = 0;
    let unsubscribe = () => {};

    function applySession(session) {
      if (!active) return;
      const token = session?.access_token || "";
      setAccessToken(token);
      setUser(session?.user || null);
      setAuthStatus(token ? "authenticated" : "unauthenticated");
      if (!token) {
        setEntered(false);
        setSignInBusy(false);
        return;
      }
      setAuthError("");
      setSignInBusy(false);
      setReturningFromProvider(false);
      /* A signed-in session is the only way in, so it opens the workspace
       * directly. Returning from Google must never land on the landing page. */
      if (shouldOpenWorkspaceOnSessionRestore(session)) setEntered(true);
    }

    function failRestore(error) {
      if (!active) return;
      setAccessToken("");
      setUser(null);
      setEntered(false);
      setSignInBusy(false);
      setReturningFromProvider(false);
      setAuthStatus("error");
      setAuthError(
        error?.message ||
          "Your session could not be restored. Check your connection and sign in again.",
      );
    }

    try {
      unsubscribe = auth.subscribe((session) => {
        authEventVersion += 1;
        applySession(session);
      });
      const restoreVersion = authEventVersion;
      withTimeout(
        Promise.resolve().then(() => auth.getSession()),
        AUTH_OPERATION_TIMEOUT_MS,
        "Restoring your session timed out. Check your connection and try again.",
      )
        .then((session) => {
          if (authEventVersion === restoreVersion) applySession(session);
        })
        .catch((error) => {
          if (authEventVersion === restoreVersion) failRestore(error);
        });
    } catch (error) {
      failRestore(error);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  /* Signing in is the only way in, so this is the single entry action. */
  async function signInWithGoogle() {
    if (
      authActionRef.current ||
      signInBusy ||
      authStatus === "restoring" ||
      authStatus === "authenticating"
    ) {
      return;
    }
    if (authStatus === "authenticated" && accessToken) {
      setEntered(true);
      return;
    }

    const action = Symbol("google-sign-in");
    authActionRef.current = action;
    setAuthError("");
    setSignInBusy(true);
    const attempt = ++signInAttemptRef.current;
    try {
      await boundedSingleFlight(
        signInPromiseRef,
        auth,
        () => auth.signInWithGoogle(),
        AUTH_OPERATION_TIMEOUT_MS,
        "Google sign-in timed out. Check your connection and try again.",
      );
    } catch (error) {
      if (!mountedRef.current || attempt !== signInAttemptRef.current) return;
      setSignInBusy(false);
      setAuthStatus("unauthenticated");
      setAuthError(
        error?.message ||
          "Google sign-in could not be started. Check your connection and try again.",
      );
    } finally {
      if (authActionRef.current === action) authActionRef.current = null;
    }
  }

  async function signOut() {
    setAuthError("");
    try {
      await auth.signOut();
    } catch (error) {
      if (mountedRef.current) {
        setAuthError(error?.message || "Signing out did not complete.");
      }
      return;
    }
    /* Saved sessions and gaps are per-account; the next sign-in must not
     * inherit the last one's rows from the shared store. */
    clearLearningData();
    if (!mountedRef.current) return;
    setAccessToken("");
    setUser(null);
    setEntered(false);
    setAuthStatus("unauthenticated");
  }

  async function refreshAccessToken() {
    const token = await boundedSingleFlight(
      refreshPromiseRef,
      auth,
      () => auth.refreshAccessToken(),
      AUTH_OPERATION_TIMEOUT_MS,
      "Refreshing your session timed out. Sign in again to continue.",
    );
    if (!token) {
      throw new Error(
        "Your session could not be refreshed. Sign in again to continue.",
      );
    }
    if (mountedRef.current) setAccessToken(token);
    return token;
  }

  return (
    <AuthProvider
      value={{
        accessToken,
        authError,
        authStatus,
        entered,
        refreshAccessToken,
        returningFromProvider,
        signInBusy,
        signInWithGoogle,
        signOut,
        user,
      }}
    >
      {children}
    </AuthProvider>
  );
}

/*
 * Landing → login → Google → app. Coming back from the provider, or restoring
 * a stored session, holds the login screen rather than falling back to the
 * landing page, so the learner never sees the landing page twice.
 */
function useAuthSettling() {
  const { authStatus, returningFromProvider } = useAuth();
  return (
    returningFromProvider ||
    authStatus === "restoring" ||
    authStatus === "authenticating"
  );
}

function EntryRoute() {
  const {
    authError,
    authStatus,
    entered,
    signInBusy,
    signInWithGoogle,
  } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const settling = useAuthSettling();

  if (entered) return <Navigate replace to="/dashboard" />;

  if (showLogin || settling) {
    return (
      <LoginScreen
        authError={authError}
        busy={signInBusy || settling}
        onBack={settling ? null : () => setShowLogin(false)}
        onSignInWithGoogle={signInWithGoogle}
        settling={settling}
      />
    );
  }

  return (
    <LandingPage
      authError={authError}
      authStatus={authStatus}
      busy={signInBusy}
      onStart={() => setShowLogin(true)}
    />
  );
}

/*
 * Deep links are real now, so an unauthenticated hit on /review has to wait out
 * a session restore before it is called a bounce.
 */
function RequireAuth() {
  const { authError, entered, signInBusy, signInWithGoogle } = useAuth();
  const settling = useAuthSettling();

  if (settling) {
    return (
      <LoginScreen
        authError={authError}
        busy
        onBack={null}
        onSignInWithGoogle={signInWithGoogle}
        settling
      />
    );
  }
  if (!entered) return <Navigate replace to="/" />;

  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

/*
 * A step is only reachable when the draft has earned it. Without this, pasting
 * /session/results into the address bar renders an analysis that never ran, and
 * a browser Back into /session/record after a reload shows an empty form.
 */
function StepGuard({ children, step }) {
  const { current, explanation, source } = useSession();
  const location = useLocation();
  const draft = { source, explanation, hasResult: Boolean(current) };

  if (!stepIsReachable(step, draft)) {
    const target = furthestStep(draft);
    if (location.pathname !== `/session/${target}`) {
      return <Navigate replace to={`/session/${target}`} />;
    }
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<EntryRoute />} path="/" />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<HistoryPage />} path="/history" />
          <Route element={<ReviewPage />} path="/review" />
          <Route element={<ProfilePage />} path="/profile" />
          <Route
            element={<Navigate replace to="/session/source" />}
            path="/session"
          />
          <Route
            element={
              <StepGuard step="source">
                <SourceStep />
              </StepGuard>
            }
            path="/session/source"
          />
          <Route
            element={
              <StepGuard step="record">
                <RecordStep />
              </StepGuard>
            }
            path="/session/record"
          />
          <Route
            element={
              <StepGuard step="confidence">
                <ConfidenceStep />
              </StepGuard>
            }
            path="/session/confidence"
          />
          <Route
            element={
              <StepGuard step="analyzing">
                <AnalyzingStep />
              </StepGuard>
            }
            path="/session/analyzing"
          />
          <Route
            element={
              <StepGuard step="results">
                <ResultsPage />
              </StepGuard>
            }
            path="/session/results"
          />
        </Route>
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

function App({ auth = browserAuth }) {
  return (
    <BrowserRouter>
      <AuthStateProvider auth={auth}>
        <AppRoutes />
      </AuthStateProvider>
    </BrowserRouter>
  );
}

export default App;
export {
  AUTH_OPERATION_TIMEOUT_MS,
  boundedSingleFlight,
  isOAuthReturn,
  readOAuthCallbackError,
  singleFlight,
  shouldOpenWorkspaceOnSessionRestore,
  withTimeout,
};
