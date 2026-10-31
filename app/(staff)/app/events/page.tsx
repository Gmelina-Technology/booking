import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { getAllEvents, photoUrl } from "@/lib/events";
import { formatDate } from "@/lib/time";
import { EventRowActions } from "./row-actions";

export const metadata = { title: "Staff — events" };

export default function EventsAdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Past events</h1>
          <p className="mt-1 text-black/60">
            Tournaments, clinics and private events shown on the home page to show prospects what you host.
          </p>
        </div>
        <Link
          href="/app/events/new"
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          + Add event
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <EventList />
      </Suspense>
    </div>
  );
}

async function EventList() {
  const owner = await requireOwner();
  const [events, activities] = await Promise.all([getAllEvents(owner.id), getAllActivities(owner.id)]);

  if (events.length === 0) {
    return (
      <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">
        No events yet. The home page section stays hidden until you add one.
      </p>
    );
  }

  return (
    <ul className="mt-8 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      {events.map((e) => {
        const activity = activities.find((a) => a.slug === e.activitySlug);
        return (
          <li key={e.id} className={`flex flex-wrap items-center gap-4 p-4 ${e.published ? "" : "bg-black/[0.02]"}`}>
            <div className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ${e.published ? "" : "opacity-40"}`}>
              {e.photo ? (
                <Image src={photoUrl(e.photo)} alt="" fill unoptimized sizes="80px" className="object-cover" />
              ) : (
                <div className={`flex h-full items-center justify-center bg-gradient-to-br text-2xl ${activity?.gradient ?? "from-emerald-500 to-emerald-800"}`}>
                  {activity?.emoji ?? "🏆"}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/app/events/${e.id}`} className="font-semibold hover:underline">
                  {e.title}
                </Link>
                {e.published ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">On home page</span>
                ) : (
                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-black/60">Hidden</span>
                )}
                {e.sample && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sample — replace me</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-black/50">
                {formatDate(e.date, { month: "long", year: "numeric" })} · {activity?.name ?? e.activitySlug}
                {e.participants > 0 && ` · ${e.participants} players`}
                {!e.photo && " · no photo"}
              </p>
            </div>
            <EventRowActions id={e.id} title={e.title} published={e.published} />
          </li>
        );
      })}
    </ul>
  );
}
