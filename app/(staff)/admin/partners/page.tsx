import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentViewingAs, isPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { platform } from "@/lib/facility";
import { ownerPath } from "@/lib/owners";
import { VIEW_AS_MINUTES } from "@/lib/session";
import { listOwners, readViewAsLog } from "@/lib/store";
import { startViewingAs } from "./actions";

export const metadata = { title: "Platform — partners" };

export default function PartnersPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
      <p className="mt-1 text-black/60">
        Every business on the platform. <strong className="text-black/80">View as</strong> opens a partner&apos;s staff area as if you were them, for{" "}
        {VIEW_AS_MINUTES} minutes, to help with support. Anything you change there changes their real bookings and settings; their sign-in,
        password and account stay theirs. Only platform admins see this page.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Partners />
      </Suspense>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium", timeStyle: "short" });

async function Partners() {
  await connection();
  const admin = await requirePlatformAdmin();
  const [owners, log, viewing] = await Promise.all([listOwners(), readViewAsLog(), currentViewingAs()]);

  return (
    <div className="mt-8 space-y-8">
      <section className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/40">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Sign-in email</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {owners.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{o.profile.name}</span>
                  <Link href={ownerPath(o.handle)} target="_blank" className="block text-xs text-black/50 hover:text-emerald-700">
                    @{o.handle} ↗
                  </Link>
                </td>
                <td className="px-4 py-3 text-black/70">{o.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-black/70">{new Date(o.createdAt).toLocaleDateString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium" })}</td>
                <td className="px-4 py-3 text-right">
                  {o.id === admin.id ? (
                    <span className="text-xs text-black/40">You</span>
                  ) : viewing?.partner.id === o.id ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Viewing now</span>
                  ) : (
                    <form action={startViewingAs.bind(null, o.id)}>
                      <button
                        type="submit"
                        className="whitespace-nowrap rounded-lg border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-emerald-600 hover:text-emerald-800"
                        title={`Open the staff area as ${o.profile.name}`}
                      >
                        View as{isPlatformAdmin(o) ? " (admin)" : ""}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent view-as activity</h2>
        {log.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">No one has viewed as a partner yet.</p>
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
                {log.slice(0, 50).map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{when(e.at)}</td>
                    <td className="px-4 py-3">{e.adminEmail}</td>
                    <td className="px-4 py-3">@{e.ownerHandle}</td>
                    <td className="px-4 py-3">{e.event === "start" ? "Started viewing as" : "Stopped"}</td>
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
