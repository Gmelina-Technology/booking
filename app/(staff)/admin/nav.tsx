"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; icon: string; badge?: "inbox" };

// Stroke icons on a 24px grid.
const icons = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  list: "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  flag: "M5 21V4h12l-2 4 2 4H5",
  page: "M3 5h18v14H3zM3 9h18",
  store: "M4 10v10h16V10M3 10l2-6h14l2 6M9 20v-5h6v5",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
};

const groups: { label: string | null; items: Item[] }[] = [
  { label: null, items: [{ href: "/admin", label: "Overview", icon: icons.home }] },
  {
    label: "Bookings",
    items: [
      { href: "/admin/inbox", label: "Inbox", icon: icons.inbox, badge: "inbox" },
      { href: "/admin/calendar", label: "Calendar", icon: icons.calendar },
      { href: "/admin/bookings", label: "All bookings", icon: icons.list },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/activities", label: "Activities", icon: icons.grid },
      { href: "/admin/events", label: "Past events", icon: icons.flag },
    ],
  },
  {
    label: "Your page",
    items: [
      { href: "/admin/banner", label: "Page design", icon: icons.page },
      { href: "/admin/business", label: "Business profile", icon: icons.store },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/admin/settings", label: "Payments & alerts", icon: icons.card },
      { href: "/admin/billing", label: "Billing", icon: icons.receipt },
      { href: "/admin/account", label: "Account & security", icon: icons.shield },
    ],
  },
];

/** Only for platform admins (PLATFORM_ADMIN_EMAILS). */
const platformGroup: { label: string; items: Item[] } = { label: "Platform", items: [{ href: "/admin/platform-fees", label: "Partner fees", icon: icons.sliders }] };

const isActive = (href: string, pathname: string | null) => (href === "/admin" ? pathname === "/admin" : !!pathname?.startsWith(href));

type SidebarProps = {
  /** Bookings waiting on a staff decision, shown on the Inbox link. */
  inboxCount: number;
  /** Who is signed in, above the menu. */
  top: React.ReactNode;
  /** Shows the platform admin pages. */
  platformAdmin?: boolean;
};

export default function AdminNav(props: SidebarProps) {
  return <Sidebar pathname={usePathname()} {...props} />;
}

/**
 * The staff menu: a sidebar on wider screens, a collapsible menu under the
 * header on phones. Also rendered without a pathname as the Suspense fallback
 * while the URL streams in.
 */
export function Sidebar({ pathname, inboxCount, top, platformAdmin }: SidebarProps & { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const shown = platformAdmin ? [...groups, platformGroup] : groups;
  const current = shown.flatMap((g) => g.items).find((i) => isActive(i.href, pathname));

  return (
    <aside className="border-b border-black/5 bg-white md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex min-h-full flex-col gap-4 p-3 md:p-4">
        <div className="flex items-center justify-between gap-3">
          {top}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="admin-menu"
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium md:hidden"
          >
            {current?.label ?? "Menu"}
            {inboxCount > 0 && !open && <span className="size-2 rounded-full bg-blue-600" aria-label={`${inboxCount} to review`} />}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={open ? "rotate-180" : ""}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <nav id="admin-menu" aria-label="Staff menu" className={`${open ? "flex" : "hidden"} flex-col gap-4 md:flex`}>
          {shown.map((g) => (
            <div key={g.label ?? "home"} className="flex flex-col gap-0.5">
              {g.label && <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-black/45">{g.label}</p>}
              {g.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                      active ? "bg-emerald-50 font-semibold text-emerald-800" : "text-black/70 hover:bg-black/5 hover:text-black"
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={item.icon} />
                    </svg>
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "inbox" && inboxCount > 0 && (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${inboxCount} to review`}>
                        {inboxCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
