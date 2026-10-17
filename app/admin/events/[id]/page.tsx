import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { getEvent } from "@/lib/events";
import { facilityNow } from "@/lib/time";
import EventForm from "../event-form";

export const metadata = { title: "Staff — edit event" };

export default function EditEventPage({ params }: PageProps<"/admin/events/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/admin/events" className="text-sm text-black/60 hover:underline">
        ← Past events
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <EditEvent params={params} />
      </Suspense>
    </div>
  );
}

async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const [event, activities] = await Promise.all([getEvent(id), getAllActivities()]);
  if (!event) notFound();
  return (
    <>
      <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight">Edit {event.title}</h1>
      <EventForm
        key={event.id}
        event={event}
        activities={activities.map((a) => ({ slug: a.slug, name: a.name }))}
        today={facilityNow().date}
      />
    </>
  );
}
