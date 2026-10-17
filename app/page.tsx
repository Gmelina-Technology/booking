import Link from "next/link";
import { getActiveActivities } from "@/lib/activities";
import { facility, formatHour, formatMoney } from "@/lib/facility";
import PastEvents from "./past-events";

export default async function Home() {
  const activities = await getActiveActivities();
  const totalCourts = activities.reduce((n, a) => n + a.resources.length, 0);
  const earliest = Math.min(...activities.map((a) => a.openHour));
  const latest = Math.max(...activities.map((a) => a.closeHour));
  const featured = activities[0];

  return (
    <>
      <section className="relative overflow-hidden bg-emerald-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(190,242,100,0.35),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">
            {activities.length} sports · {totalCourts} courts &amp; tables
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">
            Book your game at {facility.name}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            Pick a sport, choose a court and time, and you&apos;re in.
            {activities.length > 0 && ` Open daily ${formatHour(earliest)} – ${formatHour(latest)}.`}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {featured && (
              <Link
                href={`/activities/${featured.slug}`}
                className="rounded-xl bg-lime-300 px-6 py-3 font-semibold text-emerald-950 hover:bg-lime-200"
              >
                Book {featured.name.toLowerCase()}
              </Link>
            )}
            <a href="#activities" className="rounded-xl border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">
              See all activities
            </a>
          </div>
        </div>
      </section>

      <section id="activities" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Choose an activity</h2>
        <p className="mt-2 text-black/60">Prices are per court, per hour.</p>
        {activities.length === 0 && (
          <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">No activities are open for booking right now.</p>
        )}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((a) => (
            <Link
              key={a.slug}
              href={`/activities/${a.slug}`}
              className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className={`flex h-36 items-center justify-center bg-gradient-to-br ${a.gradient} text-6xl`}>
                <span className="transition group-hover:scale-110">{a.emoji}</span>
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-xl font-semibold">{a.name}</h3>
                  <p className="text-sm font-semibold text-emerald-700">{formatMoney(a.pricePerHour)}/hr</p>
                </div>
                <p className="mt-1 text-sm text-black/60">{a.tagline}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
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
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3">
          {[
            ["1", "Pick a sport", "Pickleball, badminton, tennis and more — all under one roof."],
            ["2", "Choose a slot", `See live availability for every court up to ${facility.bookingWindowDays} days ahead.`],
            ["3", "Show up & play", "Get a booking reference instantly. Pay at the front desk."],
          ].map(([n, title, body]) => (
            <div key={n}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-lime-200 font-bold text-emerald-900">
                {n}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-black/60">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
