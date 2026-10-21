// The bookings page keeps all of its state in the URL, so a view can be
// bookmarked, shared and survives refresh() after a staff action. Used by both
// the server page and the client controls.

export const MODES = ["month", "week", "day", "table"] as const;
export type Mode = (typeof MODES)[number];

/** Table quick-filter tabs. "schedule" is the one-day table. */
export const TABLE_VIEWS = ["schedule", "requests", "verify", "unpaid", "confirmed", "cancelled"] as const;
export type ViewKey = (typeof TABLE_VIEWS)[number];

export type AdminQuery = {
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

export function parseQuery(sp: SearchParams, today: string, isActivity: (slug: string) => boolean): AdminQuery {
  const view = TABLE_VIEWS.find((v) => v === sp.view);
  // Old links (e.g. the "to review" badge) only set ?view=, which means the table.
  const mode = MODES.find((m) => m === sp.mode) ?? (view ? "table" : "month");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.date)) && !Number.isNaN(Date.parse(`${sp.date}T00:00:00Z`)) ? str(sp.date) : today;
  return {
    mode,
    date,
    view: view ?? "schedule",
    activity: isActivity(str(sp.activity)) ? str(sp.activity) : "",
    past: sp.past === "1",
    cancelled: sp.cancelled === "1",
    booking: /^[A-Z0-9]{4,16}$/.test(str(sp.booking)) ? str(sp.booking) : "",
  };
}

/**
 * `/admin?…` for the query with `changes` applied. Any open booking closes unless
 * `changes` names one. Defaults are left out to keep URLs short.
 */
export function adminHref(q: AdminQuery, today: string, changes: Partial<AdminQuery> = {}) {
  const n = { ...q, booking: "", ...changes };
  const params = new URLSearchParams();
  if (n.mode !== "month") params.set("mode", n.mode);
  if (n.mode === "table" && n.view !== "schedule") params.set("view", n.view);
  if (n.date !== today && !(n.mode === "table" && n.view !== "schedule")) params.set("date", n.date);
  if (n.activity) params.set("activity", n.activity);
  if (n.past) params.set("past", "1");
  if (n.cancelled) params.set("cancelled", "1");
  if (n.booking) params.set("booking", n.booking);
  const s = params.toString();
  return s ? `/admin?${s}` : "/admin";
}
