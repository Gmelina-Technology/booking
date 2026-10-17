import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireStaff } from "@/lib/auth";
import { formatHourRange, formatMoney } from "@/lib/facility";
import { listBookings } from "@/lib/store";
import { facilityNow, formatDate, isValidDate } from "@/lib/time";
import { CancelButton, Filters } from "./controls";

export const metadata = { title: "Staff — bookings" };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
      <p className="mt-1 text-black/60">Front-desk view of every reservation.</p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <BookingsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingsTable({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  await requireStaff();
  const today = facilityNow().date;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : today;
  const activities = await getAllActivities();
  const activityBySlug = new Map(activities.map((a) => [a.slug, a]));
  const activitySlug = typeof sp.activity === "string" && activityBySlug.has(sp.activity) ? sp.activity : undefined;
  const bookings = await listBookings({ date, activitySlug });
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const revenue = confirmed.reduce((n, b) => n + b.total, 0);
  const courtHours = confirmed.reduce((n, b) => n + b.hours, 0);

  return (
    <>
      <Filters
        date={date}
        today={today}
        activity={activitySlug ?? ""}
        activities={activities.map((a) => ({ slug: a.slug, name: a.name }))}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Bookings" value={String(confirmed.length)} />
        <Stat label="Court-hours" value={String(courtHours)} />
        <Stat label="Expected revenue" value={formatMoney(revenue)} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        {bookings.length === 0 ? (
          <p className="p-10 text-center text-black/50">No bookings for {formatDate(date, { month: "long" })}.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Players</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {bookings.map((b) => {
                const activity = activityBySlug.get(b.activitySlug);
                const resource = activity?.resources.find((r) => r.id === b.resourceId);
                const cancelled = b.status === "cancelled";
                return (
                  <tr key={b.id} className={cancelled ? "text-black/40" : ""}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{formatHourRange(b.startHour, b.hours)}</td>
                    <td className="px-4 py-3">
                      {activity?.name} · {resource?.name}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-black/50">
                        {b.phone} · {b.email}
                      </p>
                      {b.notes && <p className="mt-1 text-xs italic text-black/50">“{b.notes}”</p>}
                    </td>
                    <td className="px-4 py-3">{b.players}</td>
                    <td className="px-4 py-3">{formatMoney(b.total)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                    <td className="px-4 py-3 text-right">
                      {cancelled ? (
                        <span className="rounded-full bg-black/5 px-2 py-1 text-xs">Cancelled</span>
                      ) : (
                        <CancelButton id={b.id} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <p className="text-sm text-black/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
