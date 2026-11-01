import { platform } from "@/lib/facility";

/**
 * The platform mark: a court seen from above (two sidelines and the net) forming an "H",
 * with a ball in play. Same drawing as app/icon.svg, which the favicon files are made from.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="8" fill="#047857" />
      <path d="M10 8v16M22 8v16M10 16h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="11" r="2.25" fill="#bef264" />
    </svg>
  );
}

/** Mark plus wordmark, for the platform and staff headers. */
export default function Logo() {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight">
      <LogoMark />
      {platform.name}
    </span>
  );
}
