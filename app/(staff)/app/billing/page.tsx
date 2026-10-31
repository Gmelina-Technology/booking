import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { currentViewingAs, requireOwner } from "@/lib/auth";
import { formatHourRange, formatMoney } from "@/lib/facility";
import { describeRate } from "@/lib/fee-text";
import { monthlyStatement, resolveRate } from "@/lib/fees";
import { listBookings, readFeeSchedule } from "@/lib/store";
import { addMonths, facilityNow, formatDate } from "@/lib/time";
import { AcceptFeeTerms } from "./accept-terms";

export const metadata = { title: "Staff — billing" };

export default function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mt-1 text-black/60">No monthly fees. You&apos;re only charged for bookings that were confirmed and played.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function monthLabel(month: string) {
  return formatDate(`${month}-01`, { weekday: undefined, day: undefined, month: "long", year: "numeric" });
}

async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const [owner, viewing] = await Promise.all([requireOwner(), currentViewingAs()]);
  const now = facilityNow();
  const thisMonth = now.date.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;

  const [schedule, bookings, activities] = await Promise.all([readFeeSchedule(), listBookings({ ownerId: owner.id }), getAllActivities(owner.id)]);
  const rate = resolveRate(schedule, owner.id, now.date);
  const statement = monthlyStatement(bookings, schedule, owner.id, month, now);
  const activityName = new Map(activities.map((a) => [a.slug, a.name]));
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const next = addMonths(`${month}-01`, 1).slice(0, 7);

  return (
    <div className="mt-8 space-y-8">
      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Your rate</p>
          <p className="mt-1 text-xl font-bold">{describeRate(rate)}</p>
          {rate.scope === "owner" && (
            <p className="mt-1 text-sm font-medium text-emerald-700">
              Partner promo{rate.until ? ` until ${formatDate(rate.until, { year: "numeric" })}` : ""}
              {rate.note ? ` · ${rate.note}` : ""}
            </p>
          )}
          <p className="mt-2 text-sm text-black/50">Cancelled bookings are never charged. Months with no bookings cost nothing.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          {owner.feeTermsAcceptedAt ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Agreement</p>
              <p className="mt-1 text-sm text-black/70">
                You agreed to per-booking fees on {new Date(owner.feeTermsAcceptedAt).toLocaleDateString("en-PH", { dateStyle: "medium" })}. If your rate
                changes, it only applies to bookings after the change.
              </p>
            </>
          ) : viewing ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Agreement</p>
              <p className="mt-1 text-sm text-black/70">Not agreed yet. Only the partner can agree to the fee terms, signed in as themselves.</p>
            </>
          ) : (
            <AcceptFeeTerms rate={describeRate(rate)} />
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
          <nav className="flex gap-1 text-sm">
            <Link href={`/app/billing?month=${prev}`} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 hover:border-emerald-600">
              ← {monthLabel(prev)}
            </Link>
            {month < thisMonth && (
              <Link href={`/app/billing?month=${next}`} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 hover:border-emerald-600">
                {monthLabel(next)} →
              </Link>
            )}
          </nav>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Charged bookings" value={String(statement.lines.length)} />
          <Stat label="Hours booked" value={String(statement.hours)} />
          <Stat label="Total fees" value={formatMoney(statement.total)} strong />
        </dl>
        {statement.upcoming > 0 && (
          <p className="mt-3 text-sm text-black/50">
            {statement.upcoming} more confirmed booking{statement.upcoming > 1 ? "s" : ""} this month will be charged once played.
          </p>
        )}

        {statement.lines.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white p-10 text-center text-black/50">No charges this month. Quiet days cost you nothing.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {statement.lines.map(({ booking: b, rate: r, fee }) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(b.date)}
                      <span className="block text-xs text-black/50">{formatHourRange(b.startHour, b.hours)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{b.id}</span>
                      <span className="block text-xs text-black/50">
                        {activityName.get(b.activitySlug) ?? b.activitySlug} · {b.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">{b.hours}</td>
                    <td className="px-4 py-3 text-xs text-black/60">{describeRate(r)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(fee)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-black/10">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-semibold">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(statement.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <dt className="text-xs text-black/50">{label}</dt>
      <dd className={`mt-1 text-xl ${strong ? "font-bold text-emerald-800" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
