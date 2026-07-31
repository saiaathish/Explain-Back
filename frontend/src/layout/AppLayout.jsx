import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useLearningData } from "../learningData";
import { MenuIcon } from "./Icons";
import Sidebar from "./Sidebar";

const COLLAPSED_KEY = "explain-back:sidebar-collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const { outstanding } = useLearningData();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* A browser refusing storage is not a reason to break navigation. */
    }
  }, [collapsed]);

  /* The drawer is a navigation surface; landing on a new page closes it. */
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className={`app-frame${collapsed ? " is-collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        email={user?.email}
        gapCount={outstanding.length}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onSignOut={signOut}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      )}

      <div className="app-content">
        <button
          aria-expanded={mobileOpen}
          aria-label="Open menu"
          className="mobile-menu-button"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <MenuIcon />
        </button>
        <main className="app-main">
          <Outlet />
        </main>
        <footer className="app-footer">
          Formative guidance only. Not a grade. This signed-in session stores
          source material and successful explanation attempts.
        </footer>
      </div>
    </div>
  );
}
