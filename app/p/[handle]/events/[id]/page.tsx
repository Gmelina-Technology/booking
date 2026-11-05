import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { closesAt, formatInstant, formatMinuteRange, heldHours, kindLabel, registrationState, spotsTaken, spotUnit } from "@/lib/event-schedule";
import { photoUrl } from "@/lib/events";
import { formatMoney } from "@/lib/facility";
import { feeFor, resolveRate } from "@/lib/fees";
import { releaseOverdueHolds } from "@/lib/holds";
import { eventBookings } from "@/lib/hosted-event-ops";
import { getHostedEvent } from "@/lib/hosted-events";
import { getPublicOwner, ownerFromParams, ownerPath } from "@/lib/owners";
import { readFeeSchedule } from "@/lib/store";
import { formatDate } from "@/lib/time";
import PausedNotice, { pausedNow } from "../../paused-notice";
import { SpotsBar } from "../../upcoming-events";
import RegisterForm from "./register-form";

export async function generateMetadata({ params }: PageProps<"/p/[handle]/events/[id]">): Promise<Metadata> {
  const { handle, id } = await params;
  const owner = await getPublicOwner(handle);
  const event = owner && (await getHostedEvent(owner.id, id));
  if (!owner || !event || event.status === "draft") return { title: "Not found" };
  return { title: event.title, description: event.description.slice(0, 160) || undefined };
}

export default function HostedEventPage({ params }: PageProps<"/p/[handle]/events/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-black/5" />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: { params: Promise<{ handle: string; id: string }> }) {
  const owner = await ownerFromParams(params);
  const event = await getHostedEvent(owner.id, (await params).id);
  if (!event || event.status === "draft") notFound();
  await connection();
  const [activity, paused, fees] = await Promise.all([getActivity(owner.id, event.activitySlug), pausedNow(owner), readFeeSchedule()]);

  // Spots held by unpaid registrations past their window go back first.
  const released = await releaseOverdueHolds(owner.id, await eventBookings(owner.id, event));
  const taken = spotsTaken((await eventBookings(owner.id, event)).filter((b) => !released.has(b.id)), event.id);
  const state = registrationState(event, taken);
  const left = Math.max(event.capacity - taken, 0);
  const unit = spotUnit(event.kind);
  const fee = feeFor(resolveRate(fees, owner.id, event.date), heldHours(event).hours);
  const courts = event.resourceIds.map((r) => activity?.resources.find((x) => x.id === r)?.name ?? r);

  return (
    <>
      <section className={`relative isolate overflow-hidden bg-gradient-to-br ${activity?.gradient ?? "from-emerald-500 to-emerald-800"} text-white`}>
        {event.photo && (
          <>
            <Image src={photoUrl(event.photo)} alt="" fill unoptimized priority sizes="100vw" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/15" />
          </>
        )}
        <div className={`mx-auto max-w-6xl px-4 ${event.photo ? "py-16 sm:py-24" : "py-12"}`}>
          <Link href={ownerPath(owner.handle, "#events")} className="text-sm font-medium text-white/80 hover:text-white">
            ← {owner.profile.name}
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-emerald-950">{kindLabel(event.kind)}</span>
            {activity && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
                {activity.emoji} {activity.name}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight drop-shadow-sm sm:text-4xl">{event.title}</h1>
          <p className="mt-2 text-lg text-white/90">
            {formatDate(event.date, { weekday: "long", month: "long" })} · {formatMinuteRange(event.startMinute, event.endMinute)}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {event.description && <p className="whitespace-pre-line text-lg leading-relaxed text-black/80">{event.description}</p>}
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="When" value={`${formatDate(event.date, { weekday: "long", month: "long", year: "numeric" })}, ${formatMinuteRange(event.startMinute, event.endMinute)}`} />
            <Fact label="Where" value={[owner.profile.address || owner.profile.name, courts.join(", ")].filter(Boolean).join(" · ")} />
            <Fact
              label="Price"
              value={event.price ? `${formatMoney(event.price)} per ${unit}${fee ? ` + ${formatMoney(fee)} booking fee` : ""}` : fee ? `Free + ${formatMoney(fee)} booking fee` : "Free"}
            />
            <Fact label="Payment" value={event.payment === "online" ? "Pay online when you register" : "Pay at the venue"} />
            {event.kind === "tournament" && <Fact label="Teams" value={`${event.teamSize} player${event.teamSize === 1 ? "" : "s"} per team`} />}
            <Fact label="Registration closes" value={formatInstant(closesAt(event))} />
          </dl>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">{event.status === "cancelled" ? "Cancelled" : state === "open" ? `${left} ${unit}${left === 1 ? "" : "s"} left` : state === "full" ? "Full" : "Registration closed"}</p>
              <p className="text-sm text-black/50">
                {taken} / {event.capacity} taken
              </p>
            </div>
            <SpotsBar taken={taken} capacity={event.capacity} />
            {paused ? (
              <div className="mt-5">
                <PausedNotice owner={owner} />
              </div>
            ) : event.status === "cancelled" ? (
              <p className="mt-5 text-sm text-black/60">This event was cancelled.{event.cancelReason ? ` ${event.cancelReason}` : ""}</p>
            ) : state !== "open" ? (
              <p className="mt-5 text-sm text-black/60">
                {state === "full" ? "Every spot is taken." : "Registration has closed."} Contact {owner.profile.name}
                {owner.profile.phone ? ` at ${owner.profile.phone}` : ""} if you have questions.
              </p>
            ) : (
              <RegisterForm
                ownerId={owner.id}
                eventId={event.id}
                kind={event.kind}
                price={event.price}
                fee={fee}
                maxSpots={Math.min(event.maxSpotsPerRegistration, left)}
                teamSize={event.teamSize ?? 0}
                online={event.payment === "online"}
              />
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
