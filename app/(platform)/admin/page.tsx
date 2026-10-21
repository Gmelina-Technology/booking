import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatHourRange, formatMoney, type Activity } from "@/lib/facility";
import { holdsSlot, listBookings, readSettings, type Booking } from "@/lib/store";
import { facilityNow, formatDate, isValidDate } from "@/lib/time";
import { BookingActions, Filters } from "./controls";

export const metadata = { title: "Staff — bookings" };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
      <p className="mt-1 text-black/60">Review new requests and payments, or see the schedule for any day.</p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <BookingsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Quick filter tabs above the table. Status tabs list upcoming bookings across all dates. */
const VIEWS = [
  { key: "schedule", label: "Schedule", match: null, alert: false },
  { key: "requests", label: "New requests", match: (b: Booking) => b.status === "pending", alert: true },
  { key: "verify", label: "To verify", match: (b: Booking) => b.status === "awaiting_payment" && !!b.paymentRef, alert: true },
  { key: "unpaid", label: "Awaiting payment", match: (b: Booking) => b.status === "awaiting_payment" && !b.paymentRef, alert: false },
  { key: "confirmed", label: "Confirmed", match: (b: Booking) => b.status === "confirmed", alert: false },
  { key: "cancelled", label: "Cancelled", match: (b: Booking) => b.status === "cancelled", alert: false },
] as const;
export type ViewKey = (typeof VIEWS)[number]["key"];

const viewHints: Partial<Record<ViewKey, string>> = {
  requests: "Approve to email the customer the payment QR, or decline.",
  verify: "The customer says they've paid. Find the reference in your account, then confirm.",
  unpaid: "Approved and emailed, but no payment reference yet.",
};

async function BookingsView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const owner = await requireOwner();
  const today = facilityNow().date;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : today;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const [activities, all, settings] = await Promise.all([getAllActivities(owner.id), listBookings({ ownerId: owner.id }), readSettings(owner.id)]);
  const activityBySlug = new Map(activities.map((a) => [a.slug, a]));
  const activitySlug = typeof sp.activity === "string" && activityBySlug.has(sp.activity) ? sp.activity : undefined;

  const inActivity = all.filter((b) => !activitySlug || b.activitySlug === activitySlug);
  const upcoming = inActivity.filter((b) => b.date >= today);
  const overdue = overdueIds(upcoming.filter((b) => b.status === "awaiting_payment"), settings.paymentWindowHours);

  const isSchedule = view.match === null;
  const rows = view.match
    ? upcoming.filter(view.match).sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour)
    : inActivity.filter((b) => b.date === date).sort((a, b) => a.startHour - b.startHour);
  const active = rows.filter(holdsSlot);
  const confirmed = rows.filter((b) => b.status === "confirmed");

  /** Tab links keep the activity filter (and the day, for Schedule). */
  function href(key: ViewKey) {
    const params = new URLSearchParams();
    if (key !== "schedule") params.set("view", key);
    else if (date !== today) params.set("date", date);
    if (activitySlug) params.set("activity", activitySlug);
    const q = params.toString();
    return q ? `/admin?${q}` : "/admin";
  }

  function rowProps(b: Booking): RowProps {
    return {
      b,
      activity: activityBySlug.get(b.activitySlug),
      showDate: !isSchedule,
      overdueHours: overdue.has(b.id) ? settings.paymentWindowHours : null,
    };
  }

  return (
    <>
      {/* The baseline is an inset shadow so the active tab's border can cover it without
          overflowing the scroll container (which would add a vertical scrollbar). */}
      <nav
        className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_rgb(0_0_0/0.1)]"
        aria-label="Filter bookings"
      >
        {VIEWS.map((v) => {
          const selected = v.key === view.key;
          const count = v.match ? upcoming.filter(v.match).length : null;
          return (
            <Link
              key={v.key}
              href={href(v.key)}
              aria-current={selected ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                selected ? "border-emerald-700 text-emerald-800" : "border-transparent text-black/60 hover:text-black"
              }`}
            >
              {v.label}
              {count !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    v.alert && count > 0
                      ? "bg-blue-600 font-semibold text-white"
                      : selected
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-black/5 text-black/50"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Filters
        view={isSchedule ? null : view.key}
        date={date}
        today={today}
        activity={activitySlug ?? ""}
        activities={activities.map((a) => ({ slug: a.slug, name: a.name }))}
      />
      {viewHints[view.key] && <p className="mt-3 text-sm text-black/50">{viewHints[view.key]}</p>}

      {isSchedule && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Active bookings" value={String(active.length)} />
          <Stat label="Court-hours booked" value={String(active.reduce((n, b) => n + b.hours, 0))} />
          <Stat label="Confirmed revenue" value={formatMoney(confirmed.reduce((n, b) => n + b.total, 0))} />
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-black/5 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-black/50">
            {isSchedule ? `No bookings for ${formatDate(date, { month: "long" })}.` : "No upcoming bookings here."}
          </p>
        ) : (
          <>
            {/* Phones and tablets: one stacked card per booking. */}
            <ul className="divide-y divide-black/5 lg:hidden">
              {rows.map((b) => (
                <li key={b.id}>
                  <BookingCard {...rowProps(b)} />
                </li>
              ))}
            </ul>
            {/* Desktop: one compact row per booking. No overflow container, so the actions menu isn't clipped. */}
            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/50">
                <tr>
                  <th className="py-3 pl-4 pr-3 font-medium">{isSchedule ? "Time" : "When"}</th>
                  <th className="px-3 py-3 font-medium">Activity</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Payment</th>
                  <th className="py-3 pl-3 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((b) => (
                  <BookingRow key={b.id} {...rowProps(b)} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

/** Bookings approved longer ago than the payment window. Request-time only (after connection()). */
function overdueIds(bookings: Booking[], windowHours: number) {
  const cutoff = Date.now() - windowHours * 3600_000;
  return new Set(bookings.filter((b) => b.approvedAt && Date.parse(b.approvedAt) < cutoff).map((b) => b.id));
}

type RowProps = {
  b: Booking;
  activity?: Activity;
  /** Status tabs span many days, so they show the date as well as the time. */
  showDate: boolean;
  /** The payment window in hours, when this booking is past it. */
  overdueHours: number | null;
};

function BookingRow({ b, activity, showDate, overdueHours }: RowProps) {
  return (
    <tr className={`align-top ${b.status === "cancelled" ? "text-black/40" : ""}`}>
      <td className="whitespace-nowrap py-3 pl-4 pr-3 font-medium">
        {showDate && <p>{formatDate(b.date)}</p>}
        <p className={showDate ? "text-xs font-normal text-black/60" : ""}>{formatHourRange(b.startHour, b.hours)}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Court b={b} activity={activity} />
      </td>
      {/* w-full + max-w-0: take the leftover width and truncate long text instead of widening the table. */}
      <td className="w-full max-w-0 px-3 py-3">
        <Customer b={b} />
      </td>
      <td className="px-3 py-3">
        <Status b={b} />
      </td>
      <td className="px-3 py-3">
        <Payment b={b} overdueHours={overdueHours} />
      </td>
      <td className="py-2.5 pl-3 pr-4">
        <BookingActions id={b.id} status={b.status} />
      </td>
    </tr>
  );
}

function BookingCard({ b, activity, showDate, overdueHours }: RowProps) {
  return (
    <div className={`space-y-3 p-4 text-sm ${b.status === "cancelled" ? "text-black/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {showDate && <>{formatDate(b.date)} · </>}
            {formatHourRange(b.startHour, b.hours)}
          </p>
          <p className="truncate">
            <Court b={b} activity={activity} />
          </p>
        </div>
        <Status b={b} className="items-end" />
      </div>
      <Customer b={b} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Payment b={b} overdueHours={overdueHours} />
        <div className="ml-auto">
          <BookingActions id={b.id} status={b.status} />
        </div>
      </div>
    </div>
  );
}

function Court({ b, activity }: { b: Booking; activity?: Activity }) {
  const resource = activity?.resources.find((r) => r.id === b.resourceId);
  return (
    <>
      {activity?.name ?? b.activitySlug} <span className="text-black/50">· {resource?.name ?? b.resourceId}</span>
    </>
  );
}

function Customer({ b }: { b: Booking }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium" title={`${b.name} · ${b.players} players`}>
        {b.name} <span className="font-normal text-black/50">· {b.players} players</span>
      </p>
      <p className="truncate text-xs text-black/50" title={`${b.phone} · ${b.email}`}>
        <a href={`tel:${b.phone}`} className="hover:text-emerald-700 hover:underline">
          {b.phone}
        </a>{" "}
        ·{" "}
        <a href={`mailto:${b.email}`} className="hover:text-emerald-700 hover:underline">
          {b.email}
        </a>
      </p>
      {b.notes && (
        // One line until clicked; the full note is also the tooltip.
        <details className="group mt-0.5 text-xs italic text-black/50">
          <summary
            title={b.notes}
            className="block cursor-pointer list-none truncate hover:text-black/70 group-open:whitespace-normal [&::-webkit-details-marker]:hidden"
          >
            “{b.notes}”
          </summary>
        </details>
      )}
    </div>
  );
}

function Status({ b, className = "items-start" }: { b: Booking; className?: string }) {
  return (
    <div className={`flex shrink-0 flex-col gap-1 ${className}`}>
      <StatusBadge status={b.status} />
      <span className="font-mono text-[11px] text-black/50" title="Booking reference">
        {b.id}
      </span>
    </div>
  );
}

function Payment({ b, overdueHours }: { b: Booking; overdueHours: number | null }) {
  const lastEmail = b.emails?.at(-1);
  const emailLabel = lastEmail && `${lastEmail.kind.replace("_", " ")} email`;
  return (
    <div className="space-y-1 text-xs">
      <p className="whitespace-nowrap">
        Total <span className="font-semibold">{formatMoney(b.total)}</span>
        {b.downpayment !== undefined && (
          <>
            {" "}
            <span className="text-black/30">·</span> Down <span className="font-semibold">{formatMoney(b.downpayment)}</span>
          </>
        )}
      </p>
      {(b.paymentRef || lastEmail || overdueHours !== null) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {b.paymentRef && (
            <span
              className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200"
              title="Payment reference the customer entered"
            >
              Customer ref <span className="font-mono font-semibold">{b.paymentRef}</span>
            </span>
          )}
          {lastEmail && (
            <span
              className={`whitespace-nowrap ${lastEmail.ok ? "text-black/40" : "font-semibold text-red-700"}`}
              title={lastEmail.detail ? `${emailLabel}: ${lastEmail.detail}` : emailLabel}
            >
              {lastEmail.ok ? "✓" : "✕"} {emailLabel}
              {lastEmail.ok ? "" : " failed"}
            </span>
          )}
          {overdueHours !== null && (
            <span className="whitespace-nowrap font-semibold text-red-700">Past the {overdueHours}h payment window</span>
          )}
        </div>
      )}
    </div>
  );
}

const statusStyles: Record<Booking["status"], [string, string]> = {
  pending: ["New request", "bg-blue-100 text-blue-800"],
  awaiting_payment: ["Awaiting payment", "bg-amber-100 text-amber-800"],
  confirmed: ["Confirmed", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Cancelled", "bg-black/5 text-black/50"],
};

function StatusBadge({ status }: { status: Booking["status"] }) {
  const [label, cls] = statusStyles[status];
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <p className="text-sm text-black/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
