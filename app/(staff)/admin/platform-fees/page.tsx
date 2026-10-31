import { connection } from "next/server";
import { Suspense } from "react";
import { requirePlatformAdmin } from "@/lib/auth";
import { describeRate } from "@/lib/fee-text";
import { DEFAULT_RATE, resolveRate, type FeeRate } from "@/lib/fees";
import { listOwners, readFeeSchedule } from "@/lib/store";
import { addDays, facilityNow, formatDate } from "@/lib/time";
import { RateActions } from "./rate-actions";
import RateForm from "./rate-form";

export const metadata = { title: "Platform — partner fees" };

export default function PlatformFeesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Partner fees</h1>
      <p className="mt-1 text-black/60">
        What partners pay per completed booking. Only platform admins see this page; partners see their own rate on their Billing page.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Fees />
      </Suspense>
    </div>
  );
}

async function Fees() {
  await connection();
  await requirePlatformAdmin();
  const [schedule, owners] = await Promise.all([readFeeSchedule(), listOwners()]);
  const today = facilityNow().date;
  const ownerName = new Map(owners.map((o) => [o.id, `${o.profile.name} (@${o.handle})`]));

  const current = resolveRate(schedule, "", today);
  const latestFirst = (a: FeeRate, b: FeeRate) => b.effectiveFrom.localeCompare(a.effectiveFrom);
  const platformRates = schedule.rates.filter((r) => r.scope === "platform").sort(latestFirst);
  const promos = schedule.rates.filter((r) => r.scope === "owner").sort(latestFirst);

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Platform rate today</p>
        <p className="mt-1 text-2xl font-bold">{describeRate(current)}</p>
        <p className="mt-1 text-sm text-black/50">
          {current === DEFAULT_RATE ? "Built-in default. Save a rate below to replace it." : `In effect since ${formatDate(current.effectiveFrom, { year: "numeric" })}.`}
        </p>
      </section>

      <RateForm
        owners={owners.map((o) => ({ id: o.id, name: ownerName.get(o.id)! }))}
        earliest={addDays(today, 1)}
        current={{ ratePerHour: current.ratePerHour, capPerBooking: current.capPerBooking }}
      />

      <RateTable title="Partner promos" empty="No promos yet." rates={promos} today={today} ownerName={ownerName} />
      <RateTable title="Platform rate history" empty="No saved rates yet; the built-in default applies." rates={platformRates} today={today} ownerName={ownerName} />
    </div>
  );
}

function status(r: FeeRate, today: string) {
  if (r.effectiveFrom > today) return { label: "Scheduled", className: "bg-blue-50 text-blue-700" };
  if (r.until && r.until < today) return { label: "Ended", className: "bg-black/5 text-black/50" };
  return { label: "Active", className: "bg-emerald-50 text-emerald-700" };
}

function RateTable({
  title,
  empty,
  rates,
  today,
  ownerName,
}: {
  title: string;
  empty: string;
  rates: FeeRate[];
  today: string;
  ownerName: Map<string, string>;
}) {
  const promos = rates[0]?.scope === "owner";
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {rates.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
              <tr>
                {promos && <th className="px-4 py-3">Partner</th>}
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Applies</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Changed by</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rates.map((r) => {
                const s = status(r, today);
                return (
                  <tr key={r.id}>
                    {promos && <td className="px-4 py-3 font-medium">{ownerName.get(r.ownerId ?? "") ?? "Deleted account"}</td>}
                    <td className="px-4 py-3">
                      {describeRate(r)}
                      {r.note && <span className="block text-xs text-black/50">{r.note}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      From {formatDate(r.effectiveFrom, { year: "numeric" })}
                      {r.until && <span className="block text-xs text-black/50">to {formatDate(r.until, { year: "numeric" })}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-black/50">
                      {r.createdBy}
                      <span className="block">{r.createdAt.slice(0, 10)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateActions id={r.id} scope={r.scope} scheduled={r.effectiveFrom > today} ended={!!r.until && r.until <= today} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
