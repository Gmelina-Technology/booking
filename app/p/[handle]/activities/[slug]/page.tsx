import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { photoUrl } from "@/lib/events";
import { formatHour, formatMoney, paymentReady } from "@/lib/facility";
import { getPublicOwner, ownerFromParams, ownerPath } from "@/lib/owners";
import { WEEKDAY_NAMES } from "@/lib/schedule";
import { readSettings } from "@/lib/store";
import PausedNotice, { pausedNow } from "../../paused-notice";
import BookingWidget from "./booking-widget";

export async function generateMetadata({ params }: PageProps<"/p/[handle]/activities/[slug]">): Promise<Metadata> {
  const { handle, slug } = await params;
  const owner = await getPublicOwner(handle);
  const activity = owner && (await getActivity(owner.id, slug));
  return { title: activity?.active ? `Book ${activity.name}` : "Not found" };
}

export default function ActivityPage({ params }: PageProps<"/p/[handle]/activities/[slug]">) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-black/5" />}>
      <ActivityContent params={params} />
    </Suspense>
  );
}

async function ActivityContent({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const owner = await ownerFromParams(params);
  const activity = await getActivity(owner.id, (await params).slug);
  if (!activity || !activity.active) notFound();
  const [settings, paused] = await Promise.all([readSettings(owner.id), pausedNow(owner)]);

  return (
    <>
      <section className={`relative isolate overflow-hidden bg-gradient-to-br ${activity.gradient} text-white`}>
        {activity.background && (
          <>
            <Image src={photoUrl(activity.background)} alt="" fill unoptimized priority sizes="100vw" className="-z-10 object-cover" />
            {/* Keeps the white heading readable on light photos. */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
          </>
        )}
        <div className={`mx-auto max-w-6xl px-4 ${activity.background ? "py-16 sm:py-24" : "py-12"}`}>
          <Link href={ownerPath(owner.handle, "#activities")} className="text-sm font-medium text-white/80 hover:text-white">
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
        {paused ? (
          <div>
            <PausedNotice owner={owner} />
          </div>
        ) : activity.noDownpayment || paymentReady(settings) ? (
          <BookingWidget
            ownerId={owner.id}
            bookingWindowDays={settings.bookingWindowDays}
            activity={{
              slug: activity.slug,
              name: activity.name,
              pricePerHour: activity.pricePerHour,
              peak: activity.peak ?? null,
              noDownpayment: !!activity.noDownpayment,
              openHour: activity.openHour,
              closeHour: activity.closeHour,
              maxHoursPerBooking: activity.maxHoursPerBooking,
              maxPlayers: activity.maxPlayers,
              resourceLabel: activity.resourceLabel,
              resources: activity.resources,
            }}
          />
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white p-6 text-sm shadow-sm">
            <p className="font-semibold">Online booking opens soon</p>
            <p className="mt-1 text-black/60">
              {owner.profile.name} is still setting up online payments.
              {(owner.profile.phone || owner.profile.email) && ` To book now, contact them at ${owner.profile.phone || owner.profile.email}.`}
            </p>
          </div>
        )}

        <aside className="space-y-6 lg:order-first lg:col-start-2 lg:row-start-1">
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">About</h2>
            <p className="mt-2 text-sm text-black/70">{activity.description}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-black/50">Price</dt>
                <dd className="font-medium">{formatMoney(activity.pricePerHour)} / hour</dd>
              </div>
              {activity.peak && (
                <div className="flex justify-between gap-3">
                  <dt className="text-black/50">Peak</dt>
                  <dd className="text-right font-medium">
                    {formatMoney(activity.peak.pricePerHour)} / hour, {formatHour(activity.peak.fromHour)}–{formatHour(activity.peak.toHour)}
                    {activity.peak.weekends && " and all weekend"}
                  </dd>
                </div>
              )}
              {!!activity.closedDays?.length && (
                <div className="flex justify-between gap-3">
                  <dt className="text-black/50">Closed</dt>
                  <dd className="text-right font-medium">{activity.closedDays.map((d) => `${WEEKDAY_NAMES[d]}s`).join(", ")}</dd>
                </div>
              )}
              {activity.noDownpayment && (
                <div className="flex justify-between">
                  <dt className="text-black/50">Payment</dt>
                  <dd className="font-medium">At the venue, no downpayment</dd>
                </div>
              )}
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
