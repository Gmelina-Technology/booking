import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { paymentReady } from "@/lib/facility";
import { readSettings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import HostedEventForm from "../hosted-event-form";
import { PageBanners } from "../../../page-banners";

export const metadata = { title: "Staff — create event" };

export default function NewHostedEventPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageBanners />
      <Link href="/app/events" className="text-sm text-black/60 hover:underline">
        ← Events
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Create an event</h1>
      <p className="mt-1 mb-6 text-black/60">Open play, a workshop or a tournament that players register for on your page.</p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <NewHostedEvent />
      </Suspense>
    </div>
  );
}

async function NewHostedEvent() {
  await connection();
  const owner = await requireOwner();
  const [activities, settings] = await Promise.all([getAllActivities(owner.id), readSettings(owner.id)]);
  return <HostedEventForm activities={activities} today={facilityNow().date} paymentReady={paymentReady(settings)} registered={0} />;
}
