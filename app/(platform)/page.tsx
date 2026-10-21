import Link from "next/link";
import { platform } from "@/lib/facility";
import { getPublicOwners, ownerPath } from "@/lib/owners";
import { CalendarMock, ChatMock, LegendChips, PhoneMock } from "./showcase";

const painPoints = [
  ["Double bookings", "Two staff, two chat threads, one court."],
  ["Payments you can't confirm", "Scrolling back through chat for a screenshot."],
  ["No record to look back on", "A spreadsheet isn't a booking history."],
  ["Replying after hours", "Customers message whenever they're awake."],
];

const features = [
  ["Your own booking page", "A page at /p/@yourname with your banner, activities, prices and past events. Share one link everywhere."],
  ["Day, week and month calendar", "Every court and every hour on one screen, so a taken slot is never offered twice."],
  ["A request inbox", "New requests, payments to verify, and unpaid bookings each get their own tab. Nothing gets buried."],
  ["Downpayment by QR", "Approve a request and the customer is emailed your GCash or Maya QR with the exact amount to send."],
  ["Walk-ins and phone bookings", "Staff add bookings straight onto the calendar, using the same rules as online ones."],
  ["Emails that send themselves", "Payment requests, confirmations and cancellations go out without anyone typing them."],
];

const steps = [
  ["Request", "The customer picks an activity, a court and a time, and sends a request.", "bg-sky-50 text-sky-900"],
  ["Approve", "You approve it from the inbox. They get an email with your QR and the downpayment.", "bg-amber-50 text-amber-900"],
  ["Pay", "They pay and enter the reference number on their private booking link.", "bg-amber-50 text-amber-900"],
  ["Confirmed", "You check the reference and confirm. The slot is theirs, and they get a confirmation email.", "bg-emerald-100 text-emerald-900"],
];

const faqs = [
  ["Do my customers need an account or an app?", "No. They book from your page in the browser and get a private link to check their booking and enter their payment reference."],
  ["How do payments work?", "You upload your own GCash or Maya QR and set a downpayment percentage. Money goes straight to you; we never hold it."],
  ["Can staff still take walk-ins?", "Yes. Use Create booking on the calendar. It blocks the slot the same way an online booking does."],
  ["Can I run more than one activity?", "Yes. Add as many activities as you like, each with its own courts, prices, opening hours and player limits."],
  ["What does it look like to customers?", "Pick a banner template, add your photos and past events, and your page is ready to share."],
];

export default async function PlatformHome() {
  const owners = await getPublicOwners();

  return (
    <>
      {/* Hero */}
      <section className="relative isolate bg-emerald-950 text-white">
        <div className="absolute inset-0 -z-10 overflow-hidden bg-[radial-gradient(circle_at_85%_15%,rgba(190,242,100,0.25),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(16,185,129,0.25),transparent_40%)]" />
        <div className="mx-auto max-w-6xl px-4 pt-14 sm:pt-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">For courts, gyms and sports halls</p>
          <h1 className="mt-4 max-w-4xl text-[2.75rem] leading-[1] font-bold tracking-tight sm:text-7xl">
            Bookings by chat <span className="text-lime-300">get old fast.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/80 sm:text-lg">
            {platform.name} gives your facility its own booking page and one calendar for every court. Customers request a slot,
            you approve, they pay the downpayment by QR.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-lime-300 px-6 py-3 text-center font-semibold text-emerald-950 shadow-lg shadow-lime-300/20 hover:bg-lime-200"
            >
              Create your booking page
            </Link>
            <a href="#businesses" className="rounded-xl border border-white/30 px-6 py-3 text-center font-semibold hover:bg-white/10">
              Find a place to play
            </a>
          </div>
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
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Your booking system is Messenger.</h2>
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
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
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
            {features.map(([title, body]) => (
              <li key={title} className="bg-emerald-950 p-6">
                <h3 className="text-lg font-semibold text-lime-200">{title}</h3>
                <p className="mt-2 text-white/70">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Customer side */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <PhoneMock />
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">For your customers</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">From request to confirmed, without a single DM.</h2>
            <ol className="mt-8 space-y-4">
              {steps.map(([title, body, chip], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime-200 font-bold text-emerald-900">
                    {i + 1}
                  </span>
                  <div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{title}</span>
                    <p className="mt-1.5 text-black/70">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Venues */}
      <section id="businesses" className="scroll-mt-16 border-y border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Book a court</h2>
          <p className="mt-2 text-black/60">Venues taking bookings on {platform.name}.</p>
          {owners.length === 0 ? (
            <p className="mt-8 rounded-2xl bg-[#f7f8f4] p-10 text-center text-black/50">
              No venues yet.{" "}
              <Link href="/signup" className="font-semibold text-emerald-700 hover:underline">
                Be the first
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {owners.map((o) => (
                <li key={o.id}>
                  <Link
                    href={ownerPath(o.handle)}
                    className="group flex h-full items-start gap-4 rounded-2xl border border-black/5 bg-[#f7f8f4] p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-600 text-xl font-bold text-white">
                      {o.profile.name.trim()[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold">{o.profile.name}</h3>
                      <p className="truncate text-sm text-black/50">@{o.handle}</p>
                      {o.profile.tagline && <p className="mt-2 text-sm text-black/60">{o.profile.tagline}</p>}
                      {o.profile.address && <p className="mt-1 text-sm text-black/50">{o.profile.address}</p>}
                      <p className="mt-3 text-sm font-semibold text-emerald-700 group-hover:underline">Book →</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Move your bookings out of the group chat.</h2>
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
