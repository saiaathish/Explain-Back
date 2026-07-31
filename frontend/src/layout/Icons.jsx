function Glyph({ children, className = "nav-icon" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

export function NewSessionIcon() {
  return (
    <Glyph>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function DashboardIcon() {
  return (
    <Glyph>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </Glyph>
  );
}

export function SessionsIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </Glyph>
  );
}

export function ReviewIcon() {
  return (
    <Glyph>
      <rect height="12" rx="2" width="15" x="6" y="8" />
      <path d="M8.5 5h11a2 2 0 0 1 2 2v9" />
    </Glyph>
  );
}

export function ProfileIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Glyph>
  );
}

export function PanelIcon() {
  return (
    <Glyph>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M9.5 4v16" />
    </Glyph>
  );
}

export function SignOutIcon() {
  return (
    <Glyph>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <path d="m16 15 3-3-3-3M19 12H9" />
    </Glyph>
  );
}

export function MenuIcon() {
  return (
    <Glyph>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

export function CloseIcon() {
  return (
    <Glyph>
      <path d="m6 6 12 12M18 6 6 18" />
    </Glyph>
  );
}

export function ChevronRightIcon() {
  return (
    <Glyph className="nav-icon nav-icon--small">
      <path d="m9 5 7 7-7 7" />
    </Glyph>
  );
}

export { Glyph };
