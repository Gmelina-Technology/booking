import Link from "next/link";
import { platform } from "@/lib/facility";
import { getPublicOwners, ownerPath } from "@/lib/owners";

export default async function PlatformHome() {
  const owners = await getPublicOwners();

  return (
    <>
      <section className="relative isolate overflow-hidden bg-emerald-950 text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_15%,rgba(190,242,100,0.25),transparent_45%)]" />
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">For courts, gyms and sports halls</p>
          <h1 className="mt-4 max-w-3xl text-[2.5rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Your own booking page, <span className="text-lime-300">ready in minutes</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg">
            Get a page at <span className="font-mono text-lime-200">/p/@yourname</span>. Customers pick a court and time,
            you approve, and they pay the downpayment by QR.
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
        </div>
      </section>

      <section id="businesses" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Book a court</h2>
        <p className="mt-2 text-black/60">Venues taking bookings on {platform.name}.</p>
        {owners.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white p-10 text-center text-black/50">
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
                  className="group flex h-full items-start gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
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
      </section>

      <section className="border-t border-black/5 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:gap-8 sm:py-16">
          {[
            ["1", "Sign up", "Pick your page name, like @courtsidehub. It's your link to share with customers."],
            ["2", "Set up courts", "Add your activities, prices, opening hours and courts, plus your GCash or Maya QR."],
            ["3", "Take bookings", "Approve requests from your staff inbox. Customers get the payment QR by email."],
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
