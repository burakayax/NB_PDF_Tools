type LandingIconProps = {
  kind: string;
  className?: string;
};

export function LandingIcon({ kind, className = "h-5 w-5 text-sky-200" }: LandingIconProps) {
  switch (kind) {
    case "merge":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M7 7h6a4 4 0 0 1 4 4v0" />
          <path d="M7 17h6a4 4 0 0 0 4-4v0" />
          <path d="m14 5 3 2-3 2" />
          <path d="m14 15 3 2-3 2" />
        </svg>
      );
    case "split":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M8 4v16" />
          <path d="M16 7V4" />
          <path d="M16 20v-7" />
          <path d="m13 10 3 3 3-3" />
        </svg>
      );
    case "convert":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M7 7h10" />
          <path d="M7 12h7" />
          <path d="M7 17h10" />
          <path d="m15 4 3 3-3 3" />
          <path d="m9 14-3 3 3 3" />
        </svg>
      );
    case "secure":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "compress":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M8 4H4v4" />
          <path d="m4 4 6 6" />
          <path d="M16 20h4v-4" />
          <path d="m20 20-6-6" />
          <path d="M16 4h4v4" />
          <path d="m20 4-6 6" />
          <path d="M8 20H4v-4" />
          <path d="m4 20 6-6" />
        </svg>
      );
    case "excel":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 4v16" />
          <path d="M15 4v16" />
          <path d="M4 10h16" />
          <path d="M4 14h16" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M12 3 5 6v6c0 4.5 2.8 7.8 7 9 4.2-1.2 7-4.5 7-9V6l-7-3Z" />
          <path d="m9.5 12 1.8 1.8 3.7-3.8" />
        </svg>
      );
    case "speed":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M19 10a7 7 0 1 0 2 5" />
          <path d="M12 12 16.5 8.5" />
          <path d="M19 5v5h-5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 12h8" />
        </svg>
      );
  }
}

