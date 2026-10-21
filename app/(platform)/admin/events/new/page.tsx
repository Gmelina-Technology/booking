import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { facilityNow } from "@/lib/time";
import EventForm from "../event-form";

export const metadata = { title: "Staff — add event" };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/admin/events" className="text-sm text-black/60 hover:underline">
        ← Past events
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight">Add a past event</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <NewEvent />
      </Suspense>
    </div>
  );
}

async function NewEvent() {
  await connection();
  const owner = await requireOwner();
  const activities = await getAllActivities(owner.id);
  return <EventForm activities={activities.map((a) => ({ slug: a.slug, name: a.name }))} today={facilityNow().date} />;
}
