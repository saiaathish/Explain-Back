/**
 * Claude-Style Responsive Navigation Sidebar
 * 
 * Provides collapsible rail view navigation, section links (Dashboard, History, Review, Profile),
 * live gap count badge updates, and pinned account profile block.
 */

import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";
import {
  CloseIcon,
  DashboardIcon,
  NewSessionIcon,
  PanelIcon,
  ProfileIcon,
  ReviewIcon,
  SessionsIcon,
  SignOutIcon,
} from "./Icons";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { to: "/history", label: "Past sessions", Icon: SessionsIcon },
  { to: "/review", label: "Review gaps", Icon: ReviewIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon },
];

function initialFor(email) {
  const letter = String(email || "").trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

export default function Sidebar({
  collapsed,
  email,
  gapCount,
  mobileOpen,
  onCloseMobile,
  onSignOut,
  onToggleCollapsed,
}) {
  const navigate = useNavigate();
  const { startNewSession } = useSession();

  function beginSession() {
    startNewSession();
    navigate("/session/source");
    onCloseMobile();
  }

  return (
    <nav
      aria-label="Main"
      className={`sidebar${collapsed ? " is-collapsed" : ""}${
        mobileOpen ? " is-open" : ""
      }`}
    >
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="sidebar-label sidebar-wordmark">
            Explain<span className="brand-accent">-</span>Back
          </span>
        </div>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-icon-button sidebar-collapse"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          <PanelIcon />
        </button>
        <button
          aria-label="Close menu"
          className="sidebar-icon-button sidebar-dismiss"
          onClick={onCloseMobile}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

      <button className="sidebar-new" onClick={beginSession} type="button">
        <NewSessionIcon />
        <span className="sidebar-label">Start a new session</span>
      </button>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              className={({ isActive }) =>
                `sidebar-link${isActive ? " is-active" : ""}`
              }
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
              to={to}
            >
              <Icon />
              <span className="sidebar-label">{label}</span>
              {to === "/review" && gapCount > 0 && (
                <span className="sidebar-badge" title={`${gapCount} gaps waiting`}>
                  {gapCount > 99 ? "99+" : gapCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-foot">
        <NavLink
          className={({ isActive }) =>
            `sidebar-account${isActive ? " is-active" : ""}`
          }
          onClick={onCloseMobile}
          title={collapsed ? email || "Account" : undefined}
          to="/profile"
        >
          <span aria-hidden="true" className="sidebar-avatar">
            {initialFor(email)}
          </span>
          <span className="sidebar-label sidebar-account-email">
            {email || "Your account"}
          </span>
        </NavLink>
        <button
          className="sidebar-link sidebar-signout"
          onClick={onSignOut}
          title={collapsed ? "Sign out" : undefined}
          type="button"
        >
          <SignOutIcon />
          <span className="sidebar-label">Sign out</span>
        </button>
      </div>
    </nav>
  );
}

export { NAV_ITEMS };
