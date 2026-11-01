// The bookings pages keep all of their state in the URL, so a view can be
// bookmarked, shared and survives refresh() after a staff action. Used by both
// the server pages and the client controls.
//
// One query drives three pages: the Inbox (/app/inbox: bookings waiting on a
// staff decision), the Calendar (/app/calendar) and All bookings
// (/app/bookings). staffHref() picks the page from the query, so a link that
// changes the mode or tab lands on the right one.

export const MODES = ["month", "week", "day", "table"] as const;
export type Mode = (typeof MODES)[number];

/** Inbox tabs: bookings that need a staff decision or are waiting on the customer. */
export const INBOX_VIEWS = ["requests", "verify", "unpaid"] as const;
/** All bookings tabs. "schedule" is the one-day table. */
export const LIST_VIEWS = ["all", "schedule", "confirmed", "cancelled"] as const;
export const TABLE_VIEWS = [...LIST_VIEWS, ...INBOX_VIEWS] as const;
export type ViewKey = (typeof TABLE_VIEWS)[number];

export type Section = "inbox" | "calendar" | "bookings";

export type StaffQuery = {
  mode: Mode;
  /** Anchor date: the month, week or day shown is the one containing it. */
  date: string;
  /** Table tab (table mode only). */
  view: ViewKey;
  /** Activity slug, or "" for all spaces. */
  activity: string;
  /** Include bookings before today. */
  past: boolean;
  /** Include cancelled bookings in the calendar. */
  cancelled: boolean;
  /** Booking whose details are open. */
  booking: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const str = (v: SearchParams[string]) => (typeof v === "string" ? v : "");

const isInboxView = (v: ViewKey) => (INBOX_VIEWS as readonly string[]).includes(v);

/** Which page shows this query. */
export function sectionOf(q: Pick<StaffQuery, "mode" | "view">): Section {
  if (q.mode !== "table") return "calendar";
  return isInboxView(q.view) ? "inbox" : "bookings";
}

/**
 * The query for `section`'s page, from its search params. Without a section
 * (old `/admin?…` links, sent to /app by admin/page.tsx) the mode and tab decide, as they used to.
 */
export function parseQuery(sp: SearchParams, today: string, isActivity: (slug: string) => boolean, section?: Section): StaffQuery {
  const views: readonly ViewKey[] = section === "inbox" ? INBOX_VIEWS : section === "bookings" ? LIST_VIEWS : TABLE_VIEWS;
  const view = views.find((v) => v === sp.view);
  const calendarMode = MODES.find((m) => m === sp.mode && m !== "table");
  // Old links (e.g. the "to review" badge) only set ?view=, which means the table.
  const mode =
    section === "calendar"
      ? (calendarMode ?? "month")
      : section
        ? "table"
        : (MODES.find((m) => m === sp.mode) ?? (view ? "table" : "month"));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.date)) && !Number.isNaN(Date.parse(`${sp.date}T00:00:00Z`)) ? str(sp.date) : today;
  return {
    mode,
    date,
    view: view ?? (section === "inbox" ? "requests" : section === "bookings" ? "all" : "schedule"),
    activity: isActivity(str(sp.activity)) ? str(sp.activity) : "",
    past: sp.past === "1",
    cancelled: sp.cancelled === "1",
    booking: /^[A-Z0-9]{4,16}$/.test(str(sp.booking)) ? str(sp.booking) : "",
  };
}

/**
 * `/app/<section>?…` for the query with `changes` applied. Any open booking
 * closes unless `changes` names one. Defaults are left out to keep URLs short.
 */
export function staffHref(q: StaffQuery, today: string, changes: Partial<StaffQuery> = {}) {
  const n = { ...q, booking: "", ...changes };
  const section = sectionOf(n);
  const defaultView = section === "inbox" ? "requests" : "all";
  const params = new URLSearchParams();
  if (section === "calendar" && n.mode !== "month") params.set("mode", n.mode);
  if (section !== "calendar" && n.view !== defaultView) params.set("view", n.view);
  if (n.date !== today && (section === "calendar" || n.view === "schedule")) params.set("date", n.date);
  if (n.activity) params.set("activity", n.activity);
  if (n.past) params.set("past", "1");
  if (n.cancelled) params.set("cancelled", "1");
  if (n.booking) params.set("booking", n.booking);
  const s = params.toString();
  return `/app/${section}${s ? `?${s}` : ""}`;
}
