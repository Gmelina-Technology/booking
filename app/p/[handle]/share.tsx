"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { socialIcons } from "./social-links";

// Buttons that share a business page to Facebook, X, WhatsApp, email, or the
// phone's own share sheet (which covers Messenger, Instagram, Viber, etc.).
// ShareMenu is the header button on the public page; ShareButtons is the row
// on the owner's Business profile page. The link preview they produce is
// ./opengraph-image.tsx plus the Open Graph tags in ./layout.tsx.

type Target = { key: string; label: string; icon: ReactNode; href: (url: string, text: string) => string };

const enc = encodeURIComponent;

const targets: Target[] = [
  { key: "facebook", label: "Facebook", icon: socialIcons.facebook, href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  { key: "x", label: "X", icon: socialIcons.x, href: (url, text) => `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4l-4.5 1.1z" />
        <path d="M9 8.5c0 3.5 2.5 6.5 6.5 6.5l.5-1.6-1.8-.9-1 .9a5 5 0 0 1-2.6-2.6l.9-1-.9-1.8L9 8.5z" strokeWidth="1.5" />
      </g>
    ),
    href: (url, text) => `https://wa.me/?text=${enc(`${text} ${url}`)}`,
  },
  {
    key: "email",
    label: "Email",
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3.5 6l8.5 7 8.5-7" />
      </g>
    ),
    href: (url, text) => `mailto:?subject=${enc(text)}&body=${enc(`${text}\n${url}`)}`,
  },
];

const linkIcon = (
  <path
    d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  />
);
const shareIcon = (
  <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
);

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

/** Shared state: the page's absolute URL and the open/copy/native-share actions. */
function useShare(path: string, text: string) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  // navigator.share only exists in the browser, so it's checked after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);

  const url = () => new URL(path, window.location.origin).href;
  return {
    copied,
    canNativeShare,
    open(target: Target) {
      const href = target.href(url(), text);
      if (href.startsWith("mailto:")) window.location.href = href;
      else window.open(href, "_blank", "noopener,noreferrer,width=640,height=560");
    },
    async copy() {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    /** The phone's share sheet. Rejects if the person cancels, which needs no message. */
    async native() {
      await navigator.share({ title: text, url: url() }).catch(() => {});
    },
  };
}

/** A row of labelled share buttons. */
export function ShareButtons({ path, text }: { path: string; text: string }) {
  const share = useShare(path, text);
  const button = "inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5";
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((t) => (
        <button key={t.key} type="button" onClick={() => share.open(t)} className={button}>
          <Icon>{t.icon}</Icon>
          {t.label}
        </button>
      ))}
      <button type="button" onClick={share.copy} className={button}>
        <Icon>{linkIcon}</Icon>
        <span aria-live="polite">{share.copied ? "Copied!" : "Copy link"}</span>
      </button>
      {share.canNativeShare && (
        <button type="button" onClick={share.native} className={button}>
          <Icon>{shareIcon}</Icon>
          More…
        </button>
      )}
    </div>
  );
}

/** A "Share" button that opens the phone's share sheet, or a menu of share targets on a computer. */
export function ShareMenu({ path, text }: { path: string; text: string }) {
  const share = useShare(path, text);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    // Phones and tablets: their own share sheet lists every app the person has.
    if (!open && share.canNativeShare && window.matchMedia("(pointer: coarse)").matches) await share.native();
    else setOpen((o) => !o);
  }

  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/5";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="share-menu"
        aria-label="Share this page"
        title="Share"
        className="grid size-10 place-items-center rounded-lg text-black/70 hover:bg-black/5 hover:text-black"
      >
        <Icon>{shareIcon}</Icon>
      </button>
      {open && (
        <div
          id="share-menu"
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-black/10 bg-white py-1 text-sm font-medium shadow-xl"
        >
          <p className="px-4 pb-1 pt-2 text-xs font-normal text-black/50">Share this page</p>
          {targets.map((t) => (
            <button
              key={t.key}
              type="button"
              role="menuitem"
              onClick={() => {
                share.open(t);
                setOpen(false);
              }}
              className={item}
            >
              <Icon>{t.icon}</Icon>
              {t.label}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={share.copy} className={item}>
            <Icon>{linkIcon}</Icon>
            <span aria-live="polite">{share.copied ? "Link copied!" : "Copy link"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
