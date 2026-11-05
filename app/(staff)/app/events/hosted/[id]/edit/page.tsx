import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { spotsTaken } from "@/lib/event-schedule";
import { paymentReady } from "@/lib/facility";
import { eventBookings } from "@/lib/hosted-event-ops";
import { getHostedEvent } from "@/lib/hosted-events";
import { readSettings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import HostedEventForm from "../../hosted-event-form";
import { PageBanners } from "../../../../page-banners";

export const metadata = { title: "Staff — edit event" };

export default function EditHostedEventPage({ params }: PageProps<"/app/events/hosted/[id]/edit">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageBanners />
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <EditHostedEvent params={params} />
      </Suspense>
    </div>
  );
}

async function EditHostedEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const owner = await requireOwner();
  const event = await getHostedEvent(owner.id, id);
  if (!event || event.status === "cancelled") notFound();
  const [activities, settings, bookings] = await Promise.all([getAllActivities(owner.id), readSettings(owner.id), eventBookings(owner.id, event)]);
  return (
    <>
      <Link href={`/app/events/hosted/${event.id}`} className="text-sm text-black/60 hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight">Edit {event.title}</h1>
      <HostedEventForm
        key={event.updatedAt}
        event={event}
        activities={activities}
        today={facilityNow().date}
        paymentReady={paymentReady(settings)}
        registered={spotsTaken(bookings, event.id)}
      />
    </>
  );
}
