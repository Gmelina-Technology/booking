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
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M18 14a6 6 0 014 6v1",
};

type Group = { label: string | null; items: Item[] };

/** The partner dashboard at /app. */
const partnerGroups: Group[] = [
  { label: null, items: [{ href: "/app", label: "Overview", icon: icons.home }] },
  {
    label: "Bookings",
    items: [
      { href: "/app/inbox", label: "Inbox", icon: icons.inbox, badge: "inbox" },
      { href: "/app/calendar", label: "Calendar", icon: icons.calendar },
      { href: "/app/bookings", label: "All bookings", icon: icons.list },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/app/activities", label: "Activities", icon: icons.grid },
      { href: "/app/events", label: "Past events", icon: icons.flag },
    ],
  },
  {
    label: "Your page",
    items: [
      { href: "/app/banner", label: "Page design", icon: icons.page },
      { href: "/app/business", label: "Business profile", icon: icons.store },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/app/settings", label: "Payments & alerts", icon: icons.card },
      { href: "/app/billing", label: "Billing", icon: icons.receipt },
      { href: "/app/account", label: "Account & security", icon: icons.shield },
    ],
  },
];

/** Added to the partner menu for platform admins: the way into /admin. */
const platformLink: Group = { label: "Platform", items: [{ href: "/admin", label: "Platform admin", icon: icons.sliders }] };

/** The platform admin area at /admin (PLATFORM_ADMIN_EMAILS only). */
const adminGroups: Group[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin/partners", label: "Partners", icon: icons.users },
      { href: "/admin/fees", label: "Partner fees", icon: icons.sliders },
    ],
  },
  { label: "Your business", items: [{ href: "/app", label: "Back to dashboard", icon: icons.home }] },
];

// An area's home only matches itself; other links match their sub-pages too.
const isActive = (href: string, pathname: string | null) => (href === "/app" || href === "/admin" ? pathname === href : !!pathname?.startsWith(href));

type SidebarProps = {
  /** Which menu: the partner dashboard (/app) or the platform admin area (/admin). */
  area: "app" | "admin";
  /** Bookings waiting on a staff decision, shown on the Inbox link. */
  inboxCount: number;
  /** Who is signed in, above the menu. */
  top: React.ReactNode;
  /** In the partner menu, adds the link to the platform admin area. */
  platformAdmin?: boolean;
};

export default function StaffNav(props: SidebarProps) {
  return <Sidebar pathname={usePathname()} {...props} />;
}

/**
 * The staff menu: a sidebar on wider screens, a collapsible menu under the
 * header on phones. Also rendered without a pathname as the Suspense fallback
 * while the URL streams in.
 */
export function Sidebar({ area, pathname, inboxCount, top, platformAdmin }: SidebarProps & { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const shown = area === "admin" ? adminGroups : platformAdmin ? [...partnerGroups, platformLink] : partnerGroups;
  const current = shown.flatMap((g) => g.items).find((i) => isActive(i.href, pathname));

  return (
    <aside className="border-b border-black/5 bg-white md:sticky md:top-(--staff-header) md:h-[calc(100vh-var(--staff-header))] md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex min-h-full flex-col gap-4 p-3 md:p-4">
        <div className="flex items-center justify-between gap-3">
          {top}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="staff-menu"
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium md:hidden"
          >
            {current?.label ?? "Menu"}
            {inboxCount > 0 && !open && <span className="size-2 rounded-full bg-blue-600" aria-label={`${inboxCount} to review`} />}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={open ? "rotate-180" : ""}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <nav id="staff-menu" aria-label={area === "admin" ? "Platform menu" : "Staff menu"} className={`${open ? "flex" : "hidden"} flex-col gap-4 md:flex`}>
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
