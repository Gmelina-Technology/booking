import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { currentViewingAs, requirePlatformAdmin } from "@/lib/auth";
import { formatMoney, platform } from "@/lib/facility";
import { ownerPath } from "@/lib/owners";
import { byOwner, isNewPartner, partnerStats, setupChecks, STALE_HOURS } from "@/lib/platform-stats";
import { VIEW_AS_MINUTES } from "@/lib/session";
import { listOwners, listPlatformBookings, readPartnerLog, readSettings, readViewAsLog } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import { Badges, SetupMeter, Stat, ViewAsButton } from "../ui";

export const metadata = { title: "Platform — partners" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New (30 days)" },
  { key: "setup", label: "Setup incomplete" },
  { key: "attention", label: "Slow to respond" },
  { key: "suspended", label: "Suspended" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default function PartnersPage({ searchParams }: PageProps<"/admin/partners">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
      <p className="mt-1 text-black/60">
        Every business on the platform. <strong className="text-black/80">Manage</strong> shows a partner&apos;s details, setup and bookings, and
        lets you suspend their page. <strong className="text-black/80">View as</strong> opens their staff area as if you were them, for{" "}
        {VIEW_AS_MINUTES} minutes; anything you change there changes their real bookings and settings.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Partners searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium", timeStyle: "short" });
const day = (iso: string) => new Date(iso).toLocaleDateString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium" });

async function Partners({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const admin = await requirePlatformAdmin();
  const [owners, bookings, viewAsLog, partnerLog, viewing] = await Promise.all([
    listOwners(),
    listPlatformBookings(),
    readViewAsLog(),
    readPartnerLog(),
    currentViewingAs(),
  ]);
  const today = facilityNow().date;
  const grouped = byOwner(bookings);

  const rows = await Promise.all(
    owners.map(async (o) => {
      const stats = partnerStats(grouped.get(o.id) ?? [], today);
      const [settings, activities] = await Promise.all([readSettings(o.id), getAllActivities(o.id)]);
      const checks = setupChecks(o, settings, activities, stats);
      return { owner: o, stats, setupDone: checks.filter((c) => c.done).length, setupTotal: checks.length };
    }),
  );

  const filter: FilterKey = FILTERS.find((f) => f.key === sp.filter)?.key ?? "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const matches = (r: (typeof rows)[number]) => {
    const o = r.owner;
    if (q && ![o.profile.name, o.handle, o.email, o.profile.email, o.profile.phone].some((v) => v.toLowerCase().includes(q))) return false;
    if (filter === "new") return isNewPartner(o);
    if (filter === "setup") return r.setupDone < r.setupTotal;
    if (filter === "attention") return r.stats.stale > 0;
    if (filter === "suspended") return !!o.suspension;
    return true;
  };
  // Newest partners first.
  const shown = rows.filter(matches).sort((a, b) => b.owner.createdAt.localeCompare(a.owner.createdAt));
  const counts: Record<FilterKey, number> = {
    all: rows.length,
    new: rows.filter((r) => isNewPartner(r.owner)).length,
    setup: rows.filter((r) => r.setupDone < r.setupTotal).length,
    attention: rows.filter((r) => r.stats.stale > 0).length,
    suspended: rows.filter((r) => r.owner.suspension).length,
  };
  const active = rows.filter((r) => r.stats.recent > 0).length;
  const href = (changes: { filter?: FilterKey; q?: string }) => {
    const params = new URLSearchParams();
    const f = changes.filter ?? filter;
    const text = changes.q ?? q;
    if (f !== "all") params.set("filter", f);
    if (text) params.set("q", text);
    return `/admin/partners${params.size ? `?${params}` : ""}`;
  };

  const activity = [
    ...viewAsLog.map((e) => ({ at: e.at, admin: e.adminEmail, handle: e.ownerHandle, what: e.event === "start" ? "Started viewing as" : "Stopped viewing as" })),
    ...partnerLog.map((e) => ({
      at: e.at,
      admin: e.adminEmail,
      handle: e.ownerHandle,
      what: e.event === "suspend" ? `Suspended${e.reason ? `: ${e.reason}` : ""}` : "Reinstated",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50);

  return (
    <div className="mt-8 space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Partners" value={String(rows.length)} />
        <Stat label="Joined in the last 30 days" value={String(counts.new)} />
        <Stat label="With bookings in the last 30 days" value={String(active)} />
        <Stat label={`Slow to respond (>${STALE_HOURS} h)`} value={String(counts.attention)} tone={counts.attention ? "warn" : undefined} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Filter partners" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ filter: f.key })}
                aria-current={filter === f.key ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm ${
                  filter === f.key ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-800" : "border-black/10 text-black/65 hover:border-black/25"
                }`}
              >
                {f.label} <span className="text-black/40">{counts[f.key]}</span>
              </Link>
            ))}
          </nav>
          <form action="/admin/partners" className="flex gap-2">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Name, @handle, email or phone"
              aria-label="Search partners"
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 md:w-64"
            />
            <button type="submit" className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:border-emerald-600">
              Search
            </button>
          </form>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-black/50">
            No partners match.{" "}
            {(q || filter !== "all") && (
              <Link href="/admin/partners" className="font-medium text-emerald-700 hover:underline">
                Show all
              </Link>
            )}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Bookings</th>
                  <th className="px-4 py-3">Setup</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {shown.map(({ owner: o, stats, setupDone, setupTotal }) => (
                  <tr key={o.id} className={o.suspension ? "bg-red-50/40" : undefined}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/partners/${o.id}`} className="font-medium hover:text-emerald-700">
                        {o.profile.name}
                      </Link>
                      <Badges owner={o} />
                      <Link href={ownerPath(o.handle)} target="_blank" className="block text-xs text-black/50 hover:text-emerald-700">
                        @{o.handle} ↗
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      <span className="block">{o.email}</span>
                      {o.profile.phone && <span className="block text-xs text-black/50">{o.profile.phone}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{day(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/all-bookings?partner=${o.id}`} className="block whitespace-nowrap hover:text-emerald-700" title="See their bookings">
                        <span className="font-medium">{stats.upcoming}</span> upcoming
                        <span className="block text-xs text-black/45">{stats.recent} in the last 30 days</span>
                      </Link>
                      {stats.stale > 0 ? (
                        <span className="block whitespace-nowrap text-xs font-medium text-amber-800">
                          {stats.stale} waiting over {STALE_HOURS} h
                        </span>
                      ) : stats.confirmedValue > 0 ? (
                        <span className="block whitespace-nowrap text-xs text-black/45">{formatMoney(stats.confirmedValue)} confirmed</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <SetupMeter done={setupDone} total={setupTotal} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/partners/${o.id}`}
                          className="whitespace-nowrap rounded-lg border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-emerald-600 hover:text-emerald-800"
                        >
                          Manage
                        </Link>
                        <ViewAsButton owner={o} adminId={admin.id} viewingId={viewing?.partner.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent admin activity</h2>
        <p className="text-sm text-black/50">Viewing as a partner, suspending and reinstating.</p>
        {activity.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">Nothing yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">What</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {activity.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{when(e.at)}</td>
                    <td className="px-4 py-3">{e.admin}</td>
                    <td className="px-4 py-3">@{e.handle}</td>
                    <td className="px-4 py-3">{e.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
