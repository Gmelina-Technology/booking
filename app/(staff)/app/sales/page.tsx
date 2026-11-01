import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatMoney } from "@/lib/facility";
import { firstMonths, growth, monthSales, monthsEnding, salesByActivity, type MonthSales } from "@/lib/sales";
import { listBookings } from "@/lib/store";
import { addMonths, endOfMonth, facilityNow } from "@/lib/time";
import { PageHeader } from "../page-header";
import { Change, monthLabel, RevenueChart } from "./revenue-chart";

export const metadata = { title: "Staff — sales" };

const subtitle = "How your business is growing. Revenue counts confirmed bookings on the day they’re played.";

export default function SalesPage({ searchParams }: PageProps<"/app/sales">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense
        fallback={
          <>
            <PageHeader title="Sales" subtitle={subtitle} />
            <div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />
          </>
        }
      >
        <Sales searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Sales({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const owner = await requireOwner();
  const today = facilityNow().date;
  const thisMonth = today.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const prevMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const nextMonth = addMonths(`${month}-01`, 1).slice(0, 7);

  // The current month is compared with the same days of last month, so a half-played month isn't "down".
  const soFar = month === thisMonth;
  const throughDay = soFar ? today.slice(8) : undefined;

  const [bookings, activities] = await Promise.all([listBookings({ ownerId: owner.id }), getAllActivities(owner.id)]);
  const played = bookings.filter((b) => b.date <= today);
  const first = firstMonths(played);
  const cur = monthSales(played, month, first);
  const prev = monthSales(played, prevMonth, first, throughDay);
  const trend = monthsEnding(month, 12).map((m) => monthSales(played, m, first));
  const byActivity = salesByActivity(played, month, prevMonth, throughDay);
  const activityName = new Map(activities.map((a) => [a.slug, a.name]));
  const restOfMonth = soFar
    ? bookings.filter((b) => b.status === "confirmed" && b.date > today && b.date <= endOfMonth(today)).reduce((n, b) => n + b.total, 0)
    : 0;

  const day = Number(throughDay);
  const vs = `vs ${monthLabel(prevMonth, "short")}${soFar ? (day === 1 ? " 1" : ` 1–${day}`) : ""}`;
  const average = (s: MonthSales) => (s.bookings ? Math.round(s.revenue / s.bookings) : 0);
  const yearTotal = trend.reduce((n, s) => n + s.revenue, 0);
  const best = trend.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  // Whole months only, so the month being played doesn't drag the trend down.
  const whole = trend.filter((s) => s.month !== thisMonth).map((s) => s.revenue);
  const recent = whole.slice(-3).reduce((n, r) => n + r, 0);
  const before = whole.slice(-6, -3).reduce((n, r) => n + r, 0);

  return (
    <>
      <PageHeader title="Sales" subtitle={subtitle}>
        <nav className="flex gap-1 text-sm" aria-label="Month">
          <Link href={`/app/sales?month=${prevMonth}`} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 hover:border-emerald-600">
            ← {monthLabel(prevMonth, "short")}
          </Link>
          {month < thisMonth && (
            <Link href={`/app/sales?month=${nextMonth}`} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 hover:border-emerald-600">
              {monthLabel(nextMonth, "short")} →
            </Link>
          )}
        </nav>
      </PageHeader>

      <h2 className="mt-6 text-lg font-semibold">
        {monthLabel(month)}
        {soFar && <span className="ml-2 text-sm font-normal text-black/50">so far</span>}
      </h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Revenue" value={formatMoney(cur.revenue)} change={growth(cur.revenue, prev.revenue)} vs={vs}>
          {restOfMonth > 0 ? `+ ${formatMoney(restOfMonth)} confirmed for later this month` : `${cur.hours} court-hour${cur.hours === 1 ? "" : "s"} played`}
        </Kpi>
        <Kpi label="Confirmed bookings" value={String(cur.bookings)} change={growth(cur.bookings, prev.bookings)} vs={vs}>
          {cur.cancelled} cancelled
        </Kpi>
        <Kpi label="Average booking" value={formatMoney(average(cur))} change={growth(average(cur), average(prev))} vs={vs}>
          {cur.bookings ? `${(cur.hours / cur.bookings).toFixed(1)} hours on average` : "No bookings yet"}
        </Kpi>
        <Kpi label="Customers" value={String(cur.customers)} change={growth(cur.customers, prev.customers)} vs={vs}>
          {cur.newCustomers} new · {cur.customers - cur.newCustomers} returning
        </Kpi>
      </dl>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-semibold">Revenue by month</h2>
          <p className="text-sm text-black/50">
            {formatMoney(yearTotal)} in 12 months
            {best.revenue > 0 && ` · best: ${monthLabel(best.month, "short")} ${best.month.slice(0, 4)}`}
            {growth(recent, before) !== null && (
              <>
                {" · last 3 months "}
                <Change value={growth(recent, before)} />
                {" on the 3 before"}
              </>
            )}
          </p>
        </div>
        <RevenueChart trend={trend} selected={month} thisMonth={thisMonth} />
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3">
            <h2 className="font-semibold">By activity</h2>
            <p className="text-xs text-black/50">
              {monthLabel(month)}
              {soFar && " so far"}, {vs}
            </p>
          </div>
          {byActivity.length === 0 ? (
            <p className="p-8 text-center text-sm text-black/50">No confirmed bookings this month or last.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {byActivity.map((a) => (
                <li key={a.slug} className="px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{activityName.get(a.slug) ?? a.slug}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatMoney(a.revenue)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/5" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${cur.revenue ? (a.revenue / cur.revenue) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-1 flex justify-between gap-3 text-xs text-black/50">
                    <span>
                      {a.bookings} booking{a.bookings === 1 ? "" : "s"}
                      {cur.revenue > 0 && ` · ${Math.round((a.revenue / cur.revenue) * 100)}% of revenue`}
                    </span>
                    <Change value={growth(a.revenue, a.previous)} isNew={a.previous === 0 && a.revenue > 0} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="border-b border-black/5 px-4 py-3 text-left font-semibold">Month by month</caption>
            <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3 text-right">Bookings</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-right">Customers</th>
                <th className="px-4 py-3 text-right">Cancelled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 tabular-nums">
              {trend
                .map((s, i) => ({ s, before: trend[i - 1] }))
                .reverse()
                .map(({ s, before }) => (
                  <tr key={s.month} className={s.month === month ? "bg-emerald-50/60" : undefined}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Link href={`/app/sales?month=${s.month}`} className="hover:text-emerald-700 hover:underline">
                        {monthLabel(s.month)}
                      </Link>
                      {s.month === thisMonth && <span className="ml-1.5 text-xs text-black/40">so far</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(s.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {/* A month still being played isn't compared with a whole one. */}
                      {before && s.month !== thisMonth ? <Change value={growth(s.revenue, before.revenue)} /> : <span className="text-black/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">{s.bookings}</td>
                    <td className="px-4 py-2.5 text-right">{s.hours}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.customers}
                      {s.newCustomers > 0 && <span className="block text-xs text-black/45">{s.newCustomers} new</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-black/60">{s.cancelled}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, change, vs, children }: { label: string; value: string; change: number | null; vs: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <dt className="text-sm font-medium text-black/50">{label}</dt>
      <dd className="mt-1">
        <span className="block text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <Change value={change} />
          <span className="text-black/45">{vs}</span>
        </span>
        <span className="mt-0.5 block text-sm text-black/50">{children}</span>
      </dd>
    </div>
  );
}
