import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity, getAllActivities } from "@/lib/activities";
import { formatHour, formatMoney } from "@/lib/facility";
import BookingWidget from "./booking-widget";

export async function generateStaticParams() {
  return (await getAllActivities()).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/activities/[slug]">): Promise<Metadata> {
  const activity = await getActivity((await params).slug);
  return { title: activity?.active ? `Book ${activity.name}` : "Not found" };
}

export default function ActivityPage({ params }: PageProps<"/activities/[slug]">) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-black/5" />}>
      <ActivityContent params={params} />
    </Suspense>
  );
}

async function ActivityContent({ params }: { params: Promise<{ slug: string }> }) {
  const activity = await getActivity((await params).slug);
  if (!activity || !activity.active) notFound();

  return (
    <>
      <section className={`bg-gradient-to-br ${activity.gradient} text-white`}>
        <div className="mx-auto max-w-6xl px-4 py-12">
          <Link href="/#activities" className="text-sm font-medium text-white/80 hover:text-white">
            ← All activities
          </Link>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-6xl drop-shadow">{activity.emoji}</span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight drop-shadow-sm">{activity.name}</h1>
              <p className="mt-1 text-white/90">{activity.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BookingWidget
          activity={{
            slug: activity.slug,
            name: activity.name,
            pricePerHour: activity.pricePerHour,
            openHour: activity.openHour,
            closeHour: activity.closeHour,
            maxHoursPerBooking: activity.maxHoursPerBooking,
            maxPlayers: activity.maxPlayers,
            resourceLabel: activity.resourceLabel,
            resources: activity.resources,
          }}
        />

        <aside className="space-y-6 lg:order-first lg:col-start-2 lg:row-start-1">
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">About</h2>
            <p className="mt-2 text-sm text-black/70">{activity.description}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-black/50">Price</dt>
                <dd className="font-medium">{formatMoney(activity.pricePerHour)} / hour</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/50">Hours</dt>
                <dd className="font-medium">
                  {formatHour(activity.openHour)} – {formatHour(activity.closeHour)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/50">{activity.resourceLabel}s</dt>
                <dd className="font-medium">{activity.resources.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/50">Max per booking</dt>
                <dd className="font-medium">{activity.maxHoursPerBooking} hours</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-1 text-sm text-black/70">
              {activity.includes.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
