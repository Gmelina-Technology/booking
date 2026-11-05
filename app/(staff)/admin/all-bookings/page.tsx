import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { currentViewingAs, requirePlatformAdmin } from "@/lib/auth";
import { bookingPlace, bookingTime } from "@/lib/event-schedule";
import { formatMoney, type Activity } from "@/lib/facility";
import { parsePage } from "@/lib/paging";
import { hoursWaiting, isStale, STALE_HOURS } from "@/lib/platform-stats";
import { listOwners, pagePlatformBookings, summarizePlatformBookings, type BookingStatus } from "@/lib/store";
import { addDays, endOfMonth, facilityNow, formatDate } from "@/lib/time";
import { StatusBadge } from "../../app/bookings-view";
import { Pager } from "../../pager";
import { Stat, ViewAsButton } from "../ui";

export const metadata = { title: "Platform — all bookings" };

// Every partner's bookings in one place, for platform admins to keep an eye on
// how partners are doing. Read-only: "Open" views as the partner, on that
// booking, to act on it. All state is in the URL so a view can be shared.

const PERIODS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "last30", label: "Last 30 days" },
  { key: "month", label: "Month" },
  { key: "all", label: "All time" },
] as const;
type Period = (typeof PERIODS)[number]["key"];

const STATUSES: { key: BookingStatus | "waiting"; label: string }[] = [
  { key: "waiting", label: "Waiting on partner" },
  { key: "pending", label: "New request" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cancelled", label: "Cancelled" },
];

type Query = { period: Period; month: string; partner: string; status: BookingStatus | "waiting" | ""; q: string; page: number };
type SearchParams = Record<string, string | string[] | undefined>;

function parse(sp: SearchParams, today: string): Query {
  const str = (v: SearchParams[string]) => (typeof v === "string" ? v.trim() : "");
  return {
    period: PERIODS.find((p) => p.key === sp.period)?.key ?? "upcoming",
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(str(sp.month)) ? str(sp.month) : today.slice(0, 7),
    partner: /^[a-f0-9]{1,32}$/.test(str(sp.partner)) ? str(sp.partner) : "",
    status: STATUSES.find((s) => s.key === sp.status)?.key ?? "",
    q: str(sp.q).slice(0, 80),
    page: parsePage(sp.page),
  };
}

/** The URL for the query with `changes` applied. Anything but a page change starts again at page 1. */
function href(q: Query, today: string, changes: Partial<Query> = {}) {
  const n = { ...q, page: 1, ...changes };
  const params = new URLSearchParams();
  if (n.period !== "upcoming") params.set("period", n.period);
  if (n.period === "month" && n.month !== today.slice(0, 7)) params.set("month", n.month);
  if (n.partner) params.set("partner", n.partner);
  if (n.status) params.set("status", n.status);
  if (n.q) params.set("q", n.q);
  if (n.page > 1) params.set("page", String(n.page));
  return `/admin/all-bookings${params.size ? `?${params}` : ""}`;
}

/** The dates the period covers, inclusive. */
function range(q: Query, today: string): { from?: string; to?: string } {
  switch (q.period) {
    case "today":
      return { from: today, to: today };
    case "last30":
      return { from: addDays(today, -30), to: today };
    case "month":
      return { from: `${q.month}-01`, to: endOfMonth(`${q.month}-01`) };
    case "all":
      return {};
    default:
      return { from: today };
  }
}

export default function PlatformBookingsPage({ searchParams }: PageProps<"/admin/all-bookings">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">All bookings</h1>
      <p className="mt-1 text-black/60">
        Every partner&apos;s bookings in one place. Bookings flagged <span className="font-medium text-amber-800">waiting</span> have been with
        the partner for more than {STALE_HOURS} hours without a decision. <strong className="text-black/80">Open</strong> views as the partner,
        on that booking, if you need to act on it.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Bookings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await connection();
  const admin = await requirePlatformAdmin();
  const today = facilityNow().date;
  const q = parse(sp, today);
  const { from, to } = range(q, today);

  // The database filters, counts and pages the bookings; only the page on screen is loaded.
  const filter = {
    ownerId: q.partner || undefined,
    from,
    to,
    status: q.status === "waiting" ? undefined : q.status || undefined,
    waiting: q.status === "waiting",
    search: q.q,
    // Past periods read newest first; upcoming ones soonest first.
    newestFirst: q.period !== "upcoming" && q.period !== "today",
  };
  const [owners, shown, summary, viewing] = await Promise.all([
    listOwners(),
    pagePlatformBookings(filter, q.page),
    summarizePlatformBookings(filter, today),
    currentViewingAs(),
  ]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const activities = new Map<string, Activity[]>();
  await Promise.all([...new Set(shown.rows.map((b) => b.ownerId))].map(async (id) => activities.set(id, await getAllActivities(id))));

  const totals = { waiting: 0, stale: 0, cancelled: 0, confirmedValue: 0 };
  for (const s of summary) {
    totals.waiting += s.waiting;
    totals.stale += s.stale;
    totals.cancelled += s.cancelled;
    totals.confirmedValue += s.confirmedValue;
  }
  const perPartner = summary
    .map((stats) => ({ owner: ownerById.get(stats.ownerId), stats }))
    .sort((a, b) => b.stats.stale - a.stats.stale || b.stats.total - a.stats.total);

  const partnerName = q.partner ? ownerById.get(q.partner)?.profile.name : undefined;
  const selectClass = "rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

  return (
    <div className="mt-8 space-y-8">
      <section className="space-y-3">
        <nav aria-label="Period" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={href(q, today, { period: p.key })}
              aria-current={q.period === p.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                q.period === p.key ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-800" : "border-black/10 text-black/65 hover:border-black/25"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/all-bookings" className="flex flex-wrap items-center gap-2">
          {q.period !== "upcoming" && <input type="hidden" name="period" value={q.period} />}
          {q.period === "month" && <input type="month" name="month" defaultValue={q.month} aria-label="Month" className={selectClass} />}
          <select name="partner" defaultValue={q.partner} aria-label="Partner" className={selectClass}>
            <option value="">All partners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.profile.name} (@{o.handle})
              </option>
            ))}
          </select>
          <select name="status" defaultValue={q.status} aria-label="Status" className={selectClass}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input type="search" name="q" defaultValue={q.q} placeholder="Ref, customer, email or phone" aria-label="Search bookings" className={`${selectClass} min-w-0 flex-1 md:max-w-64`} />
          <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
            Apply
          </button>
          {(q.partner || q.status || q.q) && (
            <Link href={href(q, today, { partner: "", status: "", q: "" })} className="px-2 text-sm text-black/55 hover:text-black">
              Clear
            </Link>
          )}
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={partnerName ? `Bookings · ${partnerName}` : "Bookings"} value={String(shown.total)} />
        <Stat label="Waiting on partner" value={String(totals.waiting)} />
        <Stat label={`Waiting over ${STALE_HOURS} h`} value={String(totals.stale)} tone={totals.stale ? "warn" : undefined} />
        <Stat label="Confirmed value" value={formatMoney(totals.confirmedValue)} />
      </section>

      {!q.partner && perPartner.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold">By partner</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Waiting</th>
                  <th className="px-4 py-3 text-right">Over {STALE_HOURS} h</th>
                  <th className="px-4 py-3 text-right">Cancelled</th>
                  <th className="px-4 py-3 text-right">Confirmed value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {perPartner.map(({ owner, stats }) => (
                  <tr key={owner?.id ?? "unknown"}>
                    <td className="px-4 py-3">
                      {owner ? (
                        <Link href={href(q, today, { partner: owner.id })} className="font-medium hover:text-emerald-700">
                          {owner.profile.name}
                          {owner.suspension && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Suspended</span>}
                        </Link>
                      ) : (
                        <span className="text-black/50">Deleted account</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{stats.total}</td>
                    <td className="px-4 py-3 text-right">{stats.waiting}</td>
                    <td className={`px-4 py-3 text-right ${stats.stale ? "font-semibold text-amber-800" : ""}`}>{stats.stale}</td>
                    <td className="px-4 py-3 text-right">{stats.cancelled}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(stats.confirmedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">
          Bookings{" "}
          <span className="font-normal text-black/50">
            · {shown.total}
            {totals.cancelled > 0 && ` · ${totals.cancelled} cancelled`}
          </span>
        </h2>
        {shown.total === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-8 text-center text-sm text-black/50">No bookings match these filters.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                  <tr>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Partner</th>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {shown.rows.map((b) => {
                    const owner = ownerById.get(b.ownerId);
                    const activity = activities.get(b.ownerId)?.find((a) => a.slug === b.activitySlug);
                    const court = bookingPlace(b, activity);
                    const stale = isStale(b);
                    const open = `/app/bookings?booking=${b.id}`;
                    return (
                      <tr key={b.id} className={stale ? "bg-amber-50/50" : undefined}>
                        <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatDate(b.date, { weekday: "short", month: "short", year: b.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" })}
                          <span className="block text-xs text-black/50">{bookingTime(b)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {owner ? (
                            <Link href={`/admin/partners/${owner.id}`} className="hover:text-emerald-700">
                              {owner.profile.name}
                            </Link>
                          ) : (
                            <span className="text-black/50">Deleted account</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {activity?.name ?? b.activitySlug}
                          <span className="block text-xs text-black/50">{court}</span>
                        </td>
                        <td className="px-4 py-3">
                          {b.name}
                          {b.staffCreated && <span className="block text-xs text-black/50">Added by staff</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={b.status} blocked={b.blocked} />
                          {stale && (
                            <span className="mt-1 block text-xs font-medium text-amber-800">
                              waiting {hoursWaiting(b)} h
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(b.total)}</td>
                        <td className="px-4 py-3 text-right">
                          {owner &&
                            (owner.id === admin.id && !viewing ? (
                              <Link href={open} className="text-xs font-semibold text-emerald-700 hover:underline">
                                Open
                              </Link>
                            ) : viewing?.partner.id === owner.id ? (
                              <Link href={open} className="text-xs font-semibold text-emerald-700 hover:underline">
                                Open
                              </Link>
                            ) : owner.id === admin.id ? null : (
                              <ViewAsButton owner={owner} adminId={admin.id} next={open} label="Open" />
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager {...shown} href={(page) => href(q, today, { page })} />
          </div>
        )}
      </section>
    </div>
  );
}
