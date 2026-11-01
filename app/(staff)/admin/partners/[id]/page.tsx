import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { currentViewingAs, isPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { describeRate } from "@/lib/fee-text";
import { resolveRate } from "@/lib/fees";
import { formatHourRange, formatMoney, platform } from "@/lib/facility";
import { ownerPath } from "@/lib/owners";
import { isStale, partnerStats, setupChecks, STALE_HOURS } from "@/lib/platform-stats";
import { getOwnerById, listPlatformBookings, readFeeSchedule, readPartnerLog, readSettings, readViewAsLog } from "@/lib/store";
import { facilityNow, formatDate } from "@/lib/time";
import { StatusBadge } from "../../../app/bookings-view";
import { Badges, Stat, ViewAsButton } from "../../ui";
import { reinstatePartner } from "../actions";
import SuspendForm from "./suspend-form";

export const metadata = { title: "Platform — partner" };

export default function PartnerPage({ params }: PageProps<"/admin/partners/[id]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin/partners" className="text-sm text-black/50 hover:text-emerald-700">
        ← Partners
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Partner params={params} />
      </Suspense>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium", timeStyle: "short" });

async function Partner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const admin = await requirePlatformAdmin();
  const owner = /^[a-f0-9]{1,32}$/.test(id) ? await getOwnerById(id) : undefined;
  if (!owner) notFound();

  const [bookings, settings, activities, schedule, viewAsLog, partnerLog, viewing] = await Promise.all([
    listPlatformBookings({ ownerId: owner.id }),
    readSettings(owner.id),
    getAllActivities(owner.id),
    readFeeSchedule(),
    readViewAsLog(),
    readPartnerLog(),
    currentViewingAs(),
  ]);
  const today = facilityNow().date;
  const stats = partnerStats(bookings, today);
  const checks = setupChecks(owner, settings, activities, stats);
  const rate = resolveRate(schedule, owner.id, today);
  const activityName = new Map(activities.map((a) => [a.slug, a]));
  const recent = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const history = [
    ...viewAsLog.filter((e) => e.ownerId === owner.id).map((e) => ({ at: e.at, admin: e.adminEmail, what: e.event === "start" ? "Started viewing as" : "Stopped viewing as" })),
    ...partnerLog
      .filter((e) => e.ownerId === owner.id)
      .map((e) => ({ at: e.at, admin: e.adminEmail, what: e.event === "suspend" ? `Suspended: ${e.reason ?? ""}` : "Reinstated" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);
  const protectedAccount = owner.id === admin.id || isPlatformAdmin(owner);

  return (
    <div className="mt-4 space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">
            {owner.profile.name}
            <span className="align-middle text-base">
              <Badges owner={owner} />
            </span>
          </h1>
          <p className="mt-1 text-black/60">
            <Link href={ownerPath(owner.handle)} target="_blank" className="hover:text-emerald-700">
              @{owner.handle} ↗
            </Link>{" "}
            · Joined {when(owner.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/all-bookings?partner=${owner.id}`}
            className="whitespace-nowrap rounded-lg border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-emerald-600 hover:text-emerald-800"
          >
            Their bookings
          </Link>
          <Link
            href="/admin/fees"
            className="whitespace-nowrap rounded-lg border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-emerald-600 hover:text-emerald-800"
          >
            Set a promo rate
          </Link>
          <ViewAsButton owner={owner} adminId={admin.id} viewingId={viewing?.partner.id} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming bookings" value={String(stats.upcoming)} />
        <Stat label="Bookings in the last 30 days" value={String(stats.recent)} />
        <Stat label={`Waiting over ${STALE_HOURS} h`} value={String(stats.stale)} tone={stats.stale ? "warn" : undefined} />
        <Stat label="Confirmed booking value" value={formatMoney(stats.confirmedValue)} />
      </section>

      <section className={`rounded-2xl border p-5 shadow-sm ${owner.suspension ? "border-red-200 bg-red-50/50" : "border-black/5 bg-white"}`}>
        <h2 className="font-semibold">Page status</h2>
        {owner.suspension ? (
          <div className="mt-2 space-y-3 text-sm">
            <p>
              <strong className="text-red-800">Suspended</strong> {when(owner.suspension.at)} by {owner.suspension.by}. Their page returns 404, is
              hidden from the directory and takes no new requests.
            </p>
            <p className="rounded-lg bg-white/70 p-3 text-black/70">Reason: {owner.suspension.reason}</p>
            <form action={reinstatePartner.bind(null, owner.id)}>
              <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                Reinstate page
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <p>
              <strong className="text-emerald-800">Live.</strong> Listed in the directory and taking booking requests.
            </p>
            {protectedAccount ? (
              <p className="text-black/50">Platform admin accounts can&apos;t be suspended.</p>
            ) : (
              <SuspendForm ownerId={owner.id} name={owner.profile.name} />
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Sign-in email" value={owner.email} />
            <Row label="Public email" value={owner.profile.email} />
            <Row label="Phone" value={owner.profile.phone} />
            <Row label="Address" value={owner.profile.address} />
            <Row label="Alerts go to" value={settings.staffNotifyEmail} />
            <Row label="Fee rate" value={describeRate(rate)} />
            <Row label="Fee terms" value={owner.feeTermsAcceptedAt ? `Agreed ${when(owner.feeTermsAcceptedAt)}` : "Not agreed yet"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            Setup <span className="font-normal text-black/50">· {checks.filter((c) => c.done).length} of {checks.length}</span>
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.done ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/35"}`}
                  aria-hidden
                >
                  {c.done ? "✓" : ""}
                </span>
                <span className={c.done ? "" : "text-black/60"}>{c.label}</span>
                <span className="sr-only">{c.done ? "done" : "not done"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Latest bookings</h2>
          <Link href={`/admin/all-bookings?partner=${owner.id}&period=all`} className="text-sm font-medium text-emerald-700 hover:underline">
            See all {stats.total}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">No bookings yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {recent.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(b.date, { weekday: "short", month: "short" })}
                      <span className="block text-xs text-black/50">{formatHourRange(b.startHour, b.hours)}</span>
                    </td>
                    <td className="px-4 py-3">{activityName.get(b.activitySlug)?.name ?? b.activitySlug}</td>
                    <td className="px-4 py-3">{b.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} blocked={b.blocked} />
                      {isStale(b) && <span className="ml-1.5 text-xs font-medium text-amber-800">waiting</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Admin activity</h2>
        {history.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">No admin has viewed as or suspended this partner.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white text-sm shadow-sm">
            {history.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex flex-wrap gap-x-3 px-4 py-3">
                <span className="text-black/50">{when(e.at)}</span>
                <span>{e.admin}</span>
                <span className="text-black/70">{e.what}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-black/50">{label}</dt>
      <dd className={`text-right ${value ? "" : "text-black/35"}`}>{value || "Not set"}</dd>
    </div>
  );
}
