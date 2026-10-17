"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "Bookings" },
  { href: "/admin/activities", label: "Activities" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminTabs() {
  return <TabLinks pathname={usePathname()} />;
}

/** Also rendered without a pathname as the Suspense fallback while the URL streams in. */
export function TabLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : !!pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`border-b-2 px-3 py-3 text-sm font-medium ${
              active ? "border-emerald-700 text-emerald-800" : "border-transparent text-black/60 hover:text-black"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
