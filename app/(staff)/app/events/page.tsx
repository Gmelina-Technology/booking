import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatMinuteRange, hasEnded, kindLabel, spotsTaken, spotUnit } from "@/lib/event-schedule";
import { getAllEvents, photoUrl } from "@/lib/events";
import type { HostedEvent } from "@/lib/facility";
import { getHostedEvents } from "@/lib/hosted-events";
import { listBookings } from "@/lib/store";
import { addDays, facilityNow, formatDate } from "@/lib/time";
import { EventRowActions } from "./row-actions";
import { PageBanners } from "../page-banners";

export const metadata = { title: "Staff — events" };

export default function EventsAdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageBanners />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="mt-1 text-black/60">Open play, workshops and tournaments players register for on your page.</p>
        </div>
        <Link
          href="/app/events/hosted/new"
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          + Create event
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-40 animate-pulse rounded-2xl bg-black/5" />}>
        <HostedList />
      </Suspense>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Past events</h2>
          <p className="mt-1 text-black/60">
            Photos of tournaments, workshops and private events, shown on your page to show prospects what you host.
          </p>
        </div>
        <Link href="/app/events/new" className="rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold hover:border-emerald-600">
          + Add past event
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <EventList />
      </Suspense>
    </div>
  );
}

const HOSTED_STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "bg-black/10 text-black/60"],
  published: ["Published", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Cancelled", "bg-red-100 text-red-800"],
};

/** Hosted events that haven't ended (and cancelled ones from the last week), soonest first. */
async function HostedList() {
  await connection();
  const owner = await requireOwner();
  const [events, activities, bookings] = await Promise.all([
    getHostedEvents(owner.id),
    getAllActivities(owner.id),
    listBookings({ ownerId: owner.id }).then((all) => all.filter((b) => b.eventId)),
  ]);
  const recent = addDays(facilityNow().date, -7);
  const shown = events.filter((e) => (e.status === "cancelled" ? e.date >= recent : !hasEnded(e)));
  const ended = events.filter((e) => e.status === "published" && hasEnded(e)).reverse().slice(0, 5);

  if (shown.length === 0 && ended.length === 0) {
    return (
      <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">
        No upcoming events. Create open play, a workshop or a tournament, and players can register and pay on your page.
      </p>
    );
  }

  const row = (e: HostedEvent) => {
    const activity = activities.find((a) => a.slug === e.activitySlug);
    const taken = spotsTaken(bookings, e.id);
    const [label, cls] = HOSTED_STATUS[e.status];
    return (
      <li key={e.id}>
        <Link href={`/app/events/hosted/${e.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-black/[0.02]">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${activity?.gradient ?? "from-emerald-500 to-emerald-800"}`}>
            {activity?.emoji ?? "🏆"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{e.title}</span>
              <span className="rounded-full bg-lime-200 px-2 py-0.5 text-xs font-semibold text-emerald-900">{kindLabel(e.kind)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
            </div>
            <p className="mt-0.5 text-sm text-black/50">
              {formatDate(e.date)} · {formatMinuteRange(e.startMinute, e.endMinute)} · {activity?.name ?? e.activitySlug}
            </p>
          </div>
          {e.status !== "draft" && (
            <p className="text-sm font-medium">
              {taken} / {e.capacity} <span className="font-normal text-black/50">{spotUnit(e.kind)}s</span>
            </p>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      {shown.length > 0 && <ul className="mt-8 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">{shown.map(row)}</ul>}
      {ended.length > 0 && (
        <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-black/40">Recently held</h3>
          <ul className="mt-2 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white opacity-80 shadow-sm">{ended.map(row)}</ul>
        </>
      )}
    </>
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
