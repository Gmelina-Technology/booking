import type { Metadata } from "next";
import Link from "next/link";
import { getActiveActivities } from "@/lib/activities";
import { getHeroSettings } from "@/lib/banner";
import { platform } from "@/lib/facility";
import { getPublicOwners, ownerPath, type PublicOwner } from "@/lib/owners";
import { CalendarMock, ChatMock, LegendChips, PhoneMock, StatusChip, type MockStatus } from "./showcase";
import VenueList, { type Venue } from "./venue-list";

// The home page sells to facility owners; players find venues through the list further down.
export const metadata: Metadata = {
  title: { absolute: `${platform.name} — Online booking for courts and sports halls` },
  description: "Your own booking page and one calendar for every court. No monthly fees, and nothing to pay on quiet days.",
};

/** Show "Already taking bookings at N venues" once N is at least this. */
const VENUE_COUNT_MIN = 3;

const assurances = ["No monthly fees", "₱0 on days nobody books", "No app for your customers"];

const painPoints = [
  ["Double bookings", "Two staff, two chat threads, one court."],
  ["Payments you can't confirm", "Scrolling back through chat for a screenshot."],
  ["No record to look back on", "A spreadsheet isn't a booking history."],
  ["Replying after hours", "Customers message whenever they're awake."],
];

// Stroke icons on a 24px grid, like the staff menu's.
const features = [
  ["Your own booking page", "A page at /p/@yourname with your banner, activities, prices and past events. Share one link everywhere.", "M3 5h18v14H3zM3 9h18"],
  ["Day, week and month calendar", "Every court and every hour on one screen, so a taken slot is never offered twice.", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
  ["A request inbox", "New requests, payments to verify, and unpaid bookings each get their own tab. Nothing gets buried.", "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z"],
  ["Downpayment by QR", "Approve a request and the customer is emailed your GCash or Maya QR with the exact amount to send.", "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"],
  ["Walk-ins and phone bookings", "Staff add bookings straight onto the calendar, using the same rules as online ones.", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6"],
  ["Emails that send themselves", "Payment requests, confirmations and cancellations go out without anyone typing them.", "M3 6h18v12H3zM3 7l9 6 9-6"],
];

/** A booking from both sides. `status` is where the booking stands after the step, in the calendar legend's colours. */
const steps: { title: string; who: string; body: string; status: MockStatus; label: string }[] = [
  { title: "Request", who: "Customer", body: "Picks an activity, a court and a time on your page, and sends a request.", status: "pending", label: "New request" },
  { title: "Approve", who: "You", body: "Approve it from your inbox. The customer is emailed your QR and the downpayment to send.", status: "awaiting", label: "Awaiting payment" },
  { title: "Pay", who: "Customer", body: "Pays by GCash or Maya and enters the reference number on their private booking link.", status: "awaiting", label: "Payment to verify" },
  { title: "Confirm", who: "You", body: "Check the reference and confirm. The slot is theirs, and they get a confirmation email.", status: "confirmed", label: "Confirmed" },
];

const faqs: [string, React.ReactNode][] = [
  [
    "How much does it cost?",
    <>
      No monthly fee, no setup fee and no contract. If nobody books, you pay nothing. You see exactly how it works before you
      agree to anything.{" "}
      <Link href="/pricing" className="font-semibold text-emerald-700 hover:underline">
        See pricing
      </Link>
    </>,
  ],
  ["Do my customers need an account or an app?", "No. They book from your page in the browser and get a private link to check their booking and enter their payment reference."],
  ["How do payments work?", "You upload your own GCash or Maya QR and set a downpayment percentage. Money goes straight to you; we never hold it."],
  ["What if a customer doesn't pay?", "An approved booking holds the court only for the payment window you set (24 hours to start with). If no payment reference comes in by then, the booking is cancelled, the slot opens up again and the customer is emailed."],
  ["Can bookings be cancelled?", "Yes. Staff can decline a request or cancel a booking with a reason, and the customer is emailed automatically. Customers who need to change or cancel contact you with their booking reference."],
  ["Can staff still take walk-ins?", "Yes. Use Create booking on the calendar. It blocks the slot the same way an online booking does."],
  ["Can I run more than one activity?", "Yes. Add as many activities as you like, each with its own courts, prices, opening hours and player limits."],
  ["What do I need to get started?", "Sign up, add your courts, prices and opening hours, upload your GCash or Maya QR, and share your link. There's no setup fee and nothing to install."],
  ["What does it look like to customers?", "Pick a banner template, add your photos and past events, and your page is ready to share."],
];

/** What a venue card shows: the profile, the first banner photo and the bookable activities. */
async function toVenue(o: PublicOwner): Promise<Venue> {
  const [hero, activities] = await Promise.all([getHeroSettings(o.id), getActiveActivities(o.id)]);
  return {
    id: o.id,
    name: o.profile.name,
    handle: o.handle,
    href: ownerPath(o.handle),
    tagline: o.profile.tagline,
    address: o.profile.address,
    cover: hero.images[0] && `/uploads/${hero.images[0]}`,
    activities: activities.map((a) => `${a.emoji} ${a.name}`.trim()),
  };
}

export default async function PlatformHome() {
  const owners = await getPublicOwners();
  const sample = platform.sampleHandle ? owners.find((o) => o.handle === platform.sampleHandle) : undefined;
  const venues = await Promise.all(owners.map(toVenue));

  return (
    <>
      {/* Hero */}
      <section className="relative isolate bg-emerald-950 text-white">
        <div className="absolute inset-0 -z-10 overflow-hidden bg-[radial-gradient(circle_at_85%_15%,rgba(190,242,100,0.25),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(16,185,129,0.25),transparent_40%)]" />
        <div className="mx-auto max-w-6xl px-4 pt-14 sm:pt-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">For courts, gyms and sports halls</p>
          <h1 className="mt-4 max-w-4xl text-balance text-[2.75rem] leading-[1] font-bold tracking-tight sm:text-7xl">
            Your courts, booked <span className="text-lime-300">without the back-and-forth.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/80 sm:text-lg">
            {platform.name} gives your facility its own booking page and one calendar for every court. Customers request a slot,
            you approve, and they pay the downpayment by QR.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-lime-300 px-6 py-3 text-center font-semibold text-emerald-950 shadow-lg shadow-lime-300/20 hover:bg-lime-200"
            >
              Create your booking page
            </Link>
            {sample ? (
              <Link
                href={ownerPath(sample.handle)}
                className="rounded-xl border border-white/30 px-6 py-3 text-center font-semibold hover:bg-white/10"
              >
                See a sample booking page
              </Link>
            ) : (
              <a href="#how-it-works" className="rounded-xl border border-white/30 px-6 py-3 text-center font-semibold hover:bg-white/10">
                See how it works
              </a>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            {assurances.map((a) => (
              <li key={a} className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-lime-300" aria-hidden>
                  <path d="M5 12l5 5L20 7" />
                </svg>
                {a}
              </li>
            ))}
            {owners.length >= VENUE_COUNT_MIN && (
              <li>
                Already taking bookings at <span className="font-semibold text-white">{owners.length} venues</span>
              </li>
            )}
          </ul>
          <div className="mt-14 pb-16 sm:mt-20 sm:pb-24">
            <CalendarMock />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Sound familiar?</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">Your booking system is Messenger.</h2>
            <p className="mt-4 text-lg text-black/60">
              A customer messages to book. They send a GCash screenshot. Someone marks the slot on a spreadsheet. It works, until
              two people book the same court on a Sunday morning.
            </p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              {painPoints.map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-black/5 bg-white p-5">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="mt-1 text-sm text-black/60">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ChatMock />
        </div>
      </section>

      {/* One screen */}
      <section className="bg-emerald-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">For your front desk</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">
              One screen. <span className="text-lime-300">Every court.</span>
            </h2>
            <p className="mt-4 text-lg text-white/70">
              Every booking shows where it stands, so staff know at a glance who still needs approving, who has paid and who
              hasn&apos;t.
            </p>
            <div className="mt-6">
              <LegendChips dark />
            </div>
          </div>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, body, icon]) => (
              <li key={title} className="bg-emerald-950 p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-lime-300/10 text-lime-300">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={icon} />
                  </svg>
                </span>
                <h3 className="mt-4 text-lg font-semibold text-lime-200">{title}</h3>
                <p className="mt-2 text-white/70">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How a booking works, from both sides */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <PhoneMock />
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">How a booking works</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">From request to confirmed, without a single DM.</h2>
            <ol className="mt-8 space-y-5">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime-200 font-bold text-emerald-900">
                    {i + 1}
                  </span>
                  <div>
                    <p>
                      <span className="font-semibold">{s.title}</span>
                      <span className="text-sm text-black/60"> · {s.who}</span>
                    </p>
                    <p className="mt-1 text-black/70">{s.body}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-black/60">
                      Booking is now <StatusChip status={s.status} label={s.label} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Venues, once there are any: an empty list would be a dead end for players */}
      {owners.length > 0 && (
        <section id="businesses" className="scroll-mt-16 border-y border-black/5 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Find a venue</h2>
            <p className="mt-2 text-black/60">Book a court at a venue already taking bookings on {platform.name}.</p>
            <VenueList venues={venues} />
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Straight answers.</h2>
          <p className="mt-4 text-lg text-black/60">The questions facility owners ask first.</p>
        </div>
        <div className="divide-y divide-black/10 border-y border-black/10">
          {faqs.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {q}
                <span className="text-2xl font-normal text-emerald-700 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-black/60">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-4 pb-16 sm:pb-24">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-emerald-950 px-6 py-14 text-center text-white sm:py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(190,242,100,0.25),transparent_55%)]" />
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">Move your bookings out of the group chat.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">Set up your courts, prices and payment QR, and share your link today.</p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-lime-300 px-6 py-3 font-semibold text-emerald-950 shadow-lg shadow-lime-300/20 hover:bg-lime-200"
          >
            Create your booking page
          </Link>
        </div>
      </section>
    </>
  );
}
