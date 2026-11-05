import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { closesAt, formatInstant, formatMinuteRange, kindLabel, plural, registrationState, spotsTaken, spotUnit } from "@/lib/event-schedule";
import { formatMoney } from "@/lib/facility";
import { releaseOverdueHolds } from "@/lib/holds";
import { eventBookings } from "@/lib/hosted-event-ops";
import { getHostedEvent } from "@/lib/hosted-events";
import { ownerPath } from "@/lib/owners";
import { facilityNow, formatDate } from "@/lib/time";
import { StatusBadge } from "../../../bookings-view";
import { BookingActions } from "../../../controls";
import { PageBanners } from "../../../page-banners";
import { EventActions } from "./event-actions";

export const metadata = { title: "Staff — event" };

export default function HostedEventPage({ params }: PageProps<"/app/events/hosted/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageBanners />
      <Link href="/app/events" className="text-sm text-black/60 hover:underline">
        ← Events
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Roster params={params} />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "bg-black/10 text-black/60"],
  published: ["Published", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Cancelled", "bg-red-100 text-red-800"],
};

async function Roster({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const owner = await requireOwner();
  const event = await getHostedEvent(owner.id, id);
  if (!event) notFound();
  const activity = await getActivity(owner.id, event.activitySlug);

  // Let unpaid holds past their window go first, so the numbers are current.
  const released = await releaseOverdueHolds(owner.id, await eventBookings(owner.id, event));
  const bookings = (await eventBookings(owner.id, event)).map((b) => (released.has(b.id) ? { ...b, status: "cancelled" as const } : b));
  const registrations = bookings.filter((b) => !b.blocked).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const taken = spotsTaken(bookings, event.id);
  const active = registrations.filter((b) => b.status !== "cancelled");
  const unit = spotUnit(event.kind);
  const state = registrationState(event, taken);
  const today = facilityNow().date;
  const courts = event.resourceIds.map((r) => activity?.resources.find((x) => x.id === r)?.name ?? r).join(", ");
  const [statusLabel, statusClass] = STATUS[event.status];
  const confirmed = active.filter((b) => b.status === "confirmed");

  return (
    <>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-200 px-2 py-0.5 text-xs font-semibold text-emerald-900">{kindLabel(event.kind)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
            {event.status === "published" && (
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">
                {state === "open" ? "Taking registrations" : state === "full" ? "Full" : "Registration closed"}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-black/60">
            {formatDate(event.date, { weekday: "long", month: "long" })} · {formatMinuteRange(event.startMinute, event.endMinute)} ·{" "}
            {activity?.name ?? event.activitySlug} · {courts}
          </p>
          <p className="mt-1 text-sm text-black/50">
            {event.price ? `${formatMoney(event.price)} per ${unit}` : "Free"} · {event.payment === "online" ? "paid online" : "paid at the venue"} ·
            registration closes {formatInstant(closesAt(event))}
          </p>
          {event.cancelReason && <p className="mt-2 text-sm text-red-700">Cancelled: {event.cancelReason}</p>}
        </div>
        <EventActions
          id={event.id}
          title={event.title}
          status={event.status}
          registrants={active.length}
          publicHref={event.status === "published" ? ownerPath(owner.handle, `/events/${event.id}`) : null}
        />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={unit === "team" ? "Teams" : "Players"} value={`${taken} / ${event.capacity}`} />
        <Stat label="Confirmed" value={String(confirmed.length)} />
        <Stat label="Waiting for payment" value={String(active.filter((b) => b.status === "awaiting_payment").length)} />
        <Stat label="Confirmed value" value={formatMoney(confirmed.reduce((n, b) => n + b.total, 0))} />
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Registrations</h2>
      {registrations.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-10 text-center text-black/50">
          {event.status === "draft" ? "Publish the event to start taking registrations." : "No registrations yet. Share the event's link to fill it."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          {registrations.map((b) => (
            <li key={b.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 p-4 text-sm ${b.status === "cancelled" ? "text-black/40" : ""}`}>
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-semibold">
                  {b.teamName ? `${b.teamName} · ` : ""}
                  {b.name}
                  <Link href={`/app/bookings?booking=${b.id}`} className="ml-2 font-mono text-xs font-normal text-black/40 hover:underline">
                    {b.id}
                  </Link>
                </p>
                <p className="break-words text-black/50">
                  {b.teamPlayers?.length ? b.teamPlayers.join(", ") : plural(b.spots ?? 1, "spot")} · {b.phone} · {b.email}
                </p>
                {b.notes && <p className="mt-1 text-black/60">Note: {b.notes}</p>}
                {b.paymentRef && b.status === "awaiting_payment" && (
                  <p className="mt-1 text-amber-800">
                    Says they paid · ref <span className="font-mono font-semibold">{b.paymentRef}</span>
                    {b.paymentAmount !== undefined && <> · {formatMoney(b.paymentAmount)}</>}
                    {b.paymentReceipt && (
                      <>
                        {" · "}
                        <a href={`/uploads/${b.paymentReceipt}`} target="_blank" rel="noreferrer" className="underline">
                          receipt
                        </a>
                      </>
                    )}
                  </p>
                )}
                {b.status === "cancelled" && b.cancelReason && <p className="mt-1">{b.cancelReason}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatMoney(b.total)}</span>
                <StatusBadge status={b.status} />
              </div>
              <div className="w-full sm:w-auto">
                <BookingActions b={b} today={today} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <dt className="text-sm text-black/50">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}
