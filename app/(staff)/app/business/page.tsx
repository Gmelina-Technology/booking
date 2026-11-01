import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { platform } from "@/lib/facility";
import { isPaused, ownerPath } from "@/lib/owners";
import { holdsSlot, listBookings, type PagePause } from "@/lib/store";
import { addDays, facilityNow, formatDate } from "@/lib/time";
import { ShareButtons } from "@/app/p/[handle]/share";
import BusinessForm from "./business-form";
import PauseForm, { type PauseView } from "./pause-form";

export const metadata = { title: "Staff — business profile" };

export default function BusinessPage({ searchParams }: PageProps<"/app/business">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Business profile</h1>
      <p className="mt-1 text-black/60">Your public booking page and the details customers see.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Business searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Business({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { welcome } = await searchParams;
  await connection();
  const owner = await requireOwner();
  const path = ownerPath(owner.handle);
  const today = facilityNow().date;
  const pause = pauseView(owner.pause, today);
  const upcoming = (await listBookings({ ownerId: owner.id })).filter((b) => b.date >= today && holdsSlot(b) && !b.blocked).length;

  return (
    <div className="mt-8 space-y-6">
      {welcome && (
        <div className="rounded-2xl border border-lime-300 bg-lime-50 p-5 text-sm">
          <p className="font-semibold text-emerald-900">Your page is ready 🎉</p>
          <p className="mt-1 text-emerald-900/80">
            Customers can request bookings once you&apos;ve added your payment QR or account number in{" "}
            <Link href="/app/settings" className="font-semibold underline">
              Payments &amp; alerts
            </Link>
            . Before you share the link: add your address and phone below, so customers can reach you, and check the prices and courts in{" "}
            <Link href="/app/activities" className="font-semibold underline">
              Activities
            </Link>
            . We started you off with a few sample activities. Edit or hide the ones you don&apos;t offer.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Your booking page</h2>
        <p className="mt-1 text-sm text-black/60">Share this link with customers. It can&apos;t be changed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-black/5 px-3 py-2 text-sm">{path}</code>
          <Link href={path} target="_blank" className="text-sm font-semibold text-emerald-700 hover:underline">
            Open page ↗
          </Link>
        </div>
        <div className="mt-5 border-t border-black/5 pt-4">
          <h3 className="text-sm font-semibold">Share your page</h3>
          <p className="mt-1 text-sm text-black/60">Post it on your social media pages so customers can book straight from there.</p>
          <div className="mt-3">
            <ShareButtons path={path} text={`Book a court at ${owner.profile.name}`} />
          </div>
          <p className="mt-4 text-xs font-medium text-black/50">How the link looks when shared</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated preview card, already sized */}
          <img
            src={`${path}/opengraph-image`}
            alt={`Link preview for ${owner.profile.name}`}
            width={1200}
            height={630}
            className="mt-2 w-full max-w-md rounded-xl border border-black/10"
          />
          <p className="mt-2 text-xs text-black/50">
            Uses your banner colours and first banner photo from{" "}
            <Link href="/app/banner" className="underline hover:text-black">
              Page design
            </Link>
            . Facebook and others keep a copy for a while, so changes can take time to show on links already posted.
          </p>
        </div>
        <p className="mt-3 text-xs text-black/50">
          Signed in as {owner.email}.{" "}
          <Link href="/app/account" className="underline hover:text-black">
            Manage your account
          </Link>
        </p>
      </section>

      <PauseForm pause={pause} min={addDays(today, 1)} max={addDays(today, 365)} upcoming={upcoming} />

      <BusinessForm profile={owner.profile} />
    </div>
  );
}

/** The owner's pause as the form shows it, or null while the page is live (a pause past its reopening date counts as ended). */
function pauseView(pause: PagePause | undefined, today: string): PauseView | null {
  if (!pause || !isPaused(pause, today)) return null;
  const since = new Date(pause.at).toLocaleDateString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium" });
  return { message: pause.message, until: pause.until, sinceLabel: since, untilLabel: pause.until && formatDate(pause.until, { year: "numeric" }) };
}
