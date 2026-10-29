import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatHourRange, formatMoney } from "@/lib/facility";
import { releaseOverdueHolds } from "@/lib/holds";
import { holdsSlot, listBookings, type Booking } from "@/lib/store";
import { addDays, facilityNow, formatDate, startOfWeek } from "@/lib/time";
import { Court, StatusBadge, bookable } from "./bookings-view";
import { BookingActions } from "./controls";
import { CreateBooking } from "./create-booking";
import { PageHeader } from "./page-header";
import { adminHref, parseQuery } from "./query";

export const metadata = { title: "Staff — overview" };

export default function OverviewPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense
        fallback={
          <>
            <PageHeader title="Overview" subtitle="What needs you today, at a glance." />
            <div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />
          </>
        }
      >
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Upcoming bookings waiting on staff: new requests, then payments to check. */
const needsDecision = (b: Booking) => b.status === "pending" || (b.status === "awaiting_payment" && !!b.paymentRef);

async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const owner = await requireOwner();
  const now = facilityNow();
  const today = now.date;

  // Bookmarks and emails from before the menu was split still point at /admin?view=… or ?mode=….
  if (["mode", "view", "date", "booking", "activity", "past", "cancelled"].some((k) => k in sp)) {
    redirect(adminHref(parseQuery(sp, today, () => true), today, { booking: typeof sp.booking === "string" ? sp.booking : "" }));
  }

  await releaseOverdueHolds(owner.id);
  const [activities, all] = await Promise.all([getAllActivities(owner.id), listBookings({ ownerId: owner.id })]);
  const activityBySlug = new Map(activities.map((a) => [a.slug, a]));
  const calendar = parseQuery({}, today, () => false, "calendar");
  const openHref = (b: Booking) => adminHref(calendar, today, { mode: "day", date: b.date, booking: b.id });

  const upcoming = all.filter((b) => b.date >= today);
  const requests = upcoming.filter((b) => b.status === "pending").length;
  const toVerify = upcoming.filter((b) => b.status === "awaiting_payment" && b.paymentRef).length;
  const decisions = upcoming.filter(needsDecision).sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
  const todays = all.filter((b) => b.date === today && holdsSlot(b)).sort((a, b) => a.startHour - b.startHour);
  const next = todays.find((b) => b.startHour + b.hours > now.hour);
  const weekStart = startOfWeek(today);
  const week = all.filter((b) => b.date >= weekStart && b.date <= addDays(weekStart, 6));
  const weekHours = week.filter(holdsSlot).reduce((n, b) => n + b.hours, 0);
  const weekRevenue = week.filter((b) => b.status === "confirmed").reduce((n, b) => n + b.total, 0);

  return (
    <>
      <PageHeader title="Overview" subtitle={formatDate(today, { weekday: "long", month: "long", year: "numeric" })}>
        <CreateBooking q={calendar} today={today} activities={bookable(activities)} />
      </PageHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard href="/admin/inbox" alert={requests > 0} label="New requests" value={String(requests)} note="Approve or decline →" />
        <StatCard href="/admin/inbox?view=verify" alert={toVerify > 0} label="Payments to verify" value={String(toVerify)} note="Match the reference →" />
        <StatCard
          href={adminHref(calendar, today, { mode: "day" })}
          label="Today’s bookings"
          value={String(todays.length)}
          note={next ? `Next: ${formatHourRange(next.startHour, next.hours)}` : "Nothing else today"}
        />
        <StatCard
          href={adminHref(calendar, today, { mode: "week" })}
          label="Confirmed this week"
          value={formatMoney(weekRevenue)}
          note={`${weekHours} court-hour${weekHours === 1 ? "" : "s"} booked`}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
            <h2 className="font-semibold">Needs your decision</h2>
            <Link href="/admin/inbox" className="text-sm font-medium text-emerald-700 hover:underline">
              Open inbox
            </Link>
          </div>
          {decisions.length === 0 ? (
            <p className="p-8 text-center text-sm text-black/50">You’re all caught up.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {decisions.slice(0, 6).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Link href={openHref(b)} className="truncate hover:underline">
                        {b.name}
                      </Link>
                      <StatusBadge status={b.status} />
                    </p>
                    <p className="truncate text-xs text-black/50">
                      {formatDate(b.date)} · {formatHourRange(b.startHour, b.hours)} · <Court b={b} activity={activityBySlug.get(b.activitySlug)} />
                    </p>
                  </div>
                  <BookingActions id={b.id} status={b.status} />
                </li>
              ))}
            </ul>
          )}
          {decisions.length > 6 && (
            <Link href="/admin/inbox" className="block border-t border-black/5 px-4 py-3 text-center text-sm text-black/60 hover:text-black">
              {decisions.length - 6} more in the inbox
            </Link>
          )}
        </section>

        <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
            <h2 className="font-semibold">Today</h2>
            <Link href={adminHref(calendar, today, { mode: "day" })} className="text-sm font-medium text-emerald-700 hover:underline">
              Day view
            </Link>
          </div>
          {todays.length === 0 ? (
            <p className="p-8 text-center text-sm text-black/50">No bookings today.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {todays.map((b) => (
                <li key={b.id}>
                  <Link href={openHref(b)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-black/[0.02]">
                    <span className="w-20 shrink-0 font-mono sm:w-36 sm:whitespace-nowrap text-xs text-black/60">{formatHourRange(b.startHour, b.hours)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="block truncate text-xs text-black/50">
                        <Court b={b} activity={activityBySlug.get(b.activitySlug)} />
                      </span>
                    </span>
                    <StatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({ href, label, value, note, alert = false }: { href: string; label: string; value: string; note: string; alert?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-5 shadow-sm transition-colors ${
        alert ? "border-blue-200 bg-blue-50 text-blue-950 hover:border-blue-400" : "border-black/5 bg-white hover:border-emerald-600/40"
      }`}
    >
      <p className={`text-sm font-medium ${alert ? "text-blue-800" : "text-black/50"}`}>{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-sm ${alert ? "text-blue-800" : "text-black/50"}`}>{note}</p>
    </Link>
  );
}
