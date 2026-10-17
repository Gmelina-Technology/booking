import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireStaff } from "@/lib/auth";
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
  await requireStaff();
  const today = facilityNow().date;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : today;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const [activities, all, settings] = await Promise.all([getAllActivities(), listBookings(), readSettings()]);
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-black/50">
            {isSchedule ? `No bookings for ${formatDate(date, { month: "long" })}.` : "No upcoming bookings here."}
          </p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3">{isSchedule ? "Time" : "When"}</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((b) => (
                <tr key={b.id} className={b.status === "cancelled" ? "text-black/40" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {!isSchedule && <p>{formatDate(b.date)}</p>}
                    <p className={isSchedule ? "" : "text-xs font-normal text-black/60"}>{formatHourRange(b.startHour, b.hours)}</p>
                  </td>
                  <td className="px-4 py-3">{courtLabel(b, activityBySlug.get(b.activitySlug))}</td>
                  <td className="px-4 py-3">
                    <Customer b={b} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                    <p className="mt-1 font-mono text-xs text-black/50">{b.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Payment b={b} />
                    {overdue.has(b.id) && (
                      <p className="mt-1 text-xs font-semibold text-red-700">Past the {settings.paymentWindowHours}h payment window</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BookingActions id={b.id} status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function courtLabel(b: Booking, activity?: Activity) {
  const resource = activity?.resources.find((r) => r.id === b.resourceId);
  return `${activity?.name ?? b.activitySlug} · ${resource?.name ?? b.resourceId}`;
}

function Customer({ b }: { b: Booking }) {
  return (
    <>
      <p className="font-medium">
        {b.name} <span className="font-normal text-black/50">· {b.players} players</span>
      </p>
      <p className="text-xs text-black/50">
        {b.phone} · {b.email}
      </p>
      {b.notes && <p className="mt-1 text-xs italic text-black/50">“{b.notes}”</p>}
    </>
  );
}

function Payment({ b }: { b: Booking }) {
  const lastEmail = b.emails?.at(-1);
  return (
    <div className="space-y-0.5 text-xs">
      <p>
        Total <span className="font-semibold">{formatMoney(b.total)}</span>
        {b.downpayment !== undefined && (
          <>
            {" "}
            · Down <span className="font-semibold">{formatMoney(b.downpayment)}</span>
          </>
        )}
      </p>
      {b.paymentRef && (
        <p className="text-amber-800">
          Customer ref: <span className="font-mono font-semibold">{b.paymentRef}</span>
        </p>
      )}
      {lastEmail && (
        <p className={lastEmail.ok ? "text-black/40" : "font-semibold text-red-700"} title={lastEmail.detail}>
          {lastEmail.ok ? "✓" : "✕"} {lastEmail.kind.replace("_", " ")} email
          {lastEmail.ok ? "" : " failed"}
        </p>
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
