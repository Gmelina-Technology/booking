"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** The header links that don't fit on a phone, behind a menu button. Hidden from sm up. */
export default function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
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

  return (
    <div ref={root} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label="Menu"
        className="grid size-10 place-items-center rounded-lg hover:bg-black/5"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
      </button>
      {open && (
        <nav
          id="site-menu"
          aria-label="Site menu"
          className="fixed inset-x-4 top-16 z-30 mt-1 flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-xl"
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-4 py-3 text-base hover:bg-black/5">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
