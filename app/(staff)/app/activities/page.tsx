import Link from "next/link";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatHour, formatMoney } from "@/lib/facility";
import { listBookings } from "@/lib/store";
import { ActivityRowActions } from "./row-actions";

export const metadata = { title: "Staff — activities" };

export default function ActivitiesAdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activities</h1>
          <p className="mt-1 text-black/60">Prices, opening hours and courts for everything customers can book.</p>
        </div>
        <Link
          href="/app/activities/new"
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          + New activity
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <ActivityList />
      </Suspense>
    </div>
  );
}

async function ActivityList() {
  const owner = await requireOwner();
  const [activities, bookings] = await Promise.all([getAllActivities(owner.id), listBookings({ ownerId: owner.id })]);
  const bookingCount = (slug: string) => bookings.filter((b) => b.activitySlug === slug).length;

  if (activities.length === 0) {
    return <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">No activities yet. Add your first one.</p>;
  }

  return (
    <ul className="mt-8 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      {activities.map((a, i) => (
        <li key={a.slug} className={`flex flex-wrap items-center gap-4 p-4 ${a.active ? "" : "bg-black/[0.02]"}`}>
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${a.gradient} text-2xl ${
              a.active ? "" : "opacity-40 grayscale"
            }`}
          >
            {a.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/app/activities/${a.slug}`} className="font-semibold hover:underline">
                {a.name}
              </Link>
              {a.active ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Live</span>
              ) : (
                <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-black/60">Hidden</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-black/50">
              {formatMoney(a.pricePerHour)}/hr · {formatHour(a.openHour)}–{formatHour(a.closeHour)} · {a.resources.length}{" "}
              {a.resourceLabel.toLowerCase()}
              {a.resources.length === 1 ? "" : "s"} · {bookingCount(a.slug)} booking{bookingCount(a.slug) === 1 ? "" : "s"}
            </p>
          </div>
          <ActivityRowActions
            slug={a.slug}
            name={a.name}
            active={a.active}
            isFirst={i === 0}
            isLast={i === activities.length - 1}
            canDelete={bookingCount(a.slug) === 0}
          />
        </li>
      ))}
    </ul>
  );
}
