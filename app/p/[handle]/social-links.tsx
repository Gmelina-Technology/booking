import type { ReactNode } from "react";
import { socialLinksOf, type SocialLinks, type SocialNetwork } from "@/lib/socials";

// The business's social media accounts as icon links, in the page header and
// footer. Renders nothing when the owner hasn't added any (/app/business).

/** Brand marks for a 24×24, fill="currentColor" svg. Also used by the share buttons (./share.tsx). */
export const socialIcons: Record<SocialNetwork, ReactNode> = {
  facebook: <path d="M14 9h3V5h-3c-2.8 0-4 1.7-4 4v2H8v4h2v8h4v-8h3l1-4h-4V9.5c0-.3.2-.5.5-.5z" />,
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </g>
  ),
  tiktok: (
    <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
  ),
  youtube: (
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" />
  ),
  x: <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />,
};

export default function SocialLinks({ socials, name, className = "" }: { socials?: SocialLinks; name: string; className?: string }) {
  const links = socialLinksOf(socials);
  if (links.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`}>
      {links.map((l) => (
        <li key={l.key}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${name} on ${l.label}`}
            title={l.label}
            className="grid size-9 place-items-center rounded-lg text-black/60 hover:bg-black/5 hover:text-black"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {socialIcons[l.key]}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
