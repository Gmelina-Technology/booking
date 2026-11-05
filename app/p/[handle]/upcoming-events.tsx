import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getAllActivities } from "@/lib/activities";
import { formatMinuteRange, hasEnded, kindLabel, registrationState, spotsTaken, spotUnit, type RegistrationState } from "@/lib/event-schedule";
import { photoUrl } from "@/lib/events";
import { formatMoney, type Activity, type HostedEvent } from "@/lib/facility";
import { eventBookings } from "@/lib/hosted-event-ops";
import { getHostedEvents } from "@/lib/hosted-events";
import { ownerPath, type PublicOwner } from "@/lib/owners";
import { formatDate } from "@/lib/time";

const MAX_SHOWN = 6;

/** Published events players can still go to, soonest first. Hidden when there are none. */
export default async function UpcomingEvents({ owner }: { owner: PublicOwner }) {
  await connection();
  const events = (await getHostedEvents(owner.id)).filter((e) => e.status === "published" && !hasEnded(e)).slice(0, MAX_SHOWN);
  if (events.length === 0) return null;
  const [activities, taken] = await Promise.all([
    getAllActivities(owner.id),
    Promise.all(events.map(async (e) => spotsTaken(await eventBookings(owner.id, e), e.id))),
  ]);

  return (
    <section id="events" className="scroll-mt-16 border-t border-black/5 bg-lime-50/60">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Upcoming events</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Open play, workshops and tournaments</h2>
        <p className="mt-2 text-black/60">Grab a spot: register here, no court booking needed.</p>
        <ul className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {events.map((e, i) => (
            <li key={e.id}>
              <UpcomingCard
                href={ownerPath(owner.handle, `/events/${e.id}`)}
                event={e}
                activity={activities.find((a) => a.slug === e.activitySlug)}
                taken={taken[i]}
                state={registrationState(e, taken[i])}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function UpcomingCard({ href, event, activity, taken, state }: { href: string; event: HostedEvent; activity?: Activity; taken: number; state: RegistrationState }) {
  const left = Math.max(event.capacity - taken, 0);
  const unit = spotUnit(event.kind);
  return (
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br text-6xl ${activity?.gradient ?? "from-emerald-500 to-emerald-800"}`}>
        {event.photo ? (
          <Image src={photoUrl(event.photo)} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <span className="transition group-hover:scale-110">{activity?.emoji ?? "🏆"}</span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {formatDate(event.date, { month: "short" })}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-emerald-950">{kindLabel(event.kind)}</span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {activity && <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{activity.name}</p>}
        <h3 className="mt-1 text-lg font-semibold">{event.title}</h3>
        <p className="mt-1 text-sm text-black/60">{formatMinuteRange(event.startMinute, event.endMinute)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4 text-sm">
          <span className="font-semibold text-emerald-700">{event.price ? `${formatMoney(event.price)} / ${unit}` : "Free"}</span>
          <span className={state === "open" ? "text-black/60" : "font-semibold text-black/50"}>
            {state === "open" ? `${left} ${unit}${left === 1 ? "" : "s"} left` : state === "full" ? "Full" : "Registration closed"}
          </span>
        </div>
        <SpotsBar taken={taken} capacity={event.capacity} />
      </div>
    </Link>
  );
}

export function SpotsBar({ taken, capacity }: { taken: number; capacity: number }) {
  const pct = Math.min(100, Math.round((taken / capacity) * 100));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10" role="presentation">
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-black/30" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
