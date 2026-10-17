import Image from "next/image";
import { getAllActivities } from "@/lib/activities";
import { getPublishedEvents, photoUrl } from "@/lib/events";
import { facility, type Activity, type PastEvent } from "@/lib/facility";
import { formatDate } from "@/lib/time";

const MAX_SHOWN = 6;

/** Home page showcase of events the facility has hosted. Hidden when there are none. */
export default async function PastEvents() {
  const [events, activities] = await Promise.all([getPublishedEvents(), getAllActivities()]);
  if (events.length === 0) return null;

  const totalPlayers = events.reduce((n, e) => n + e.participants, 0);
  const sports = new Set(events.map((e) => e.activitySlug)).size;

  return (
    <section className="bg-emerald-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">Recent events</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">What&apos;s been happening at {facility.name}</h2>
            <p className="mt-2 max-w-xl text-white/70">
              Tournaments, clinics, leagues and private events. Want to host your own? Talk to the front desk.
            </p>
          </div>
          <dl className="flex gap-8">
            <Stat value={String(events.length)} label={events.length === 1 ? "event" : "events"} />
            {totalPlayers > 0 && <Stat value={totalPlayers.toLocaleString(facility.locale)} label="players & guests" />}
            <Stat value={String(sports)} label={sports === 1 ? "sport" : "sports"} />
          </dl>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.slice(0, MAX_SHOWN).map((event) => (
            <EventCard key={event.id} event={event} activity={activities.find((a) => a.slug === event.activitySlug)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-white/60">{label}</dt>
      <dd className="text-3xl font-bold text-lime-300">{value}</dd>
    </div>
  );
}

export function EventCard({ event, activity }: { event: PastEvent; activity?: Activity }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white text-black shadow-lg">
      <div className="relative aspect-[4/3]">
        {event.photo ? (
          <Image
            src={photoUrl(event.photo)}
            alt={event.title}
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div
            className={`flex h-full items-center justify-center bg-gradient-to-br text-7xl ${
              activity?.gradient ?? "from-emerald-500 to-emerald-800"
            }`}
          >
            {activity?.emoji ?? "🏆"}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {formatDate(event.date, { weekday: undefined, month: "short", year: "numeric" })}
        </span>
        {event.participants > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-emerald-950">
            {event.participants.toLocaleString(facility.locale)} players
          </span>
        )}
      </div>
      <div className="p-5">
        {activity && <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{activity.name}</p>}
        <h3 className="mt-1 text-lg font-semibold">{event.title}</h3>
        {event.summary && <p className="mt-1 text-sm text-black/60">{event.summary}</p>}
      </div>
    </article>
  );
}
