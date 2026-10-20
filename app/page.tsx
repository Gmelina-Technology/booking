import Link from "next/link";
import { getActiveActivities } from "@/lib/activities";
import { facility, formatHour, formatMoney } from "@/lib/facility";
import Hero from "./hero";
import PastEvents from "./past-events";

export default async function Home() {
  const activities = await getActiveActivities();

  return (
    <>
      <Hero activities={activities} />

      <section id="activities" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Choose an activity</h2>
        <p className="mt-2 text-black/60">Prices are per court, per hour.</p>
        {activities.length === 0 && (
          <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">No activities are open for booking right now.</p>
        )}
        {/* Phone: compact rows with the icon on the side. Tablet and up: cards. */}
        <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {activities.map((a) => (
            <Link
              key={a.slug}
              href={`/activities/${a.slug}`}
              className="group flex overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:block"
            >
              <div
                className={`flex w-20 shrink-0 items-center justify-center bg-gradient-to-br ${a.gradient} text-4xl sm:h-36 sm:w-auto sm:text-6xl`}
              >
                <span className="transition group-hover:scale-110">{a.emoji}</span>
              </div>
              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate text-lg font-semibold sm:text-xl">{a.name}</h3>
                  <p className="shrink-0 text-sm font-semibold text-emerald-700">{formatMoney(a.pricePerHour)}/hr</p>
                </div>
                <p className="mt-1 text-sm text-black/60">{a.tagline}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-sm sm:mt-4">
                  <span className="text-black/50">
                    {a.resources.length} {a.resourceLabel.toLowerCase()}
                    {a.resources.length > 1 ? "s" : ""} · {formatHour(a.openHour)}–{formatHour(a.closeHour)}
                  </span>
                  <span className="font-semibold text-emerald-700 group-hover:underline">Book →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <PastEvents />

      <section className="border-t border-black/5 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:gap-8 sm:py-16">
          {[
            ["1", "Pick a sport", "Pickleball, badminton, tennis and more — all under one roof."],
            ["2", "Choose a slot", `See live availability for every court up to ${facility.bookingWindowDays} days ahead.`],
            ["3", "Pay & play", "Once approved, we email a QR code for the downpayment. Pay the balance at the front desk."],
          ].map(([n, title, body]) => (
            <div key={n} className="flex gap-4 sm:block">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime-200 font-bold text-emerald-900">
                {n}
              </span>
              <div>
                <h3 className="text-lg font-semibold sm:mt-4">{title}</h3>
                <p className="mt-1 text-black/60">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
