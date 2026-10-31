import type { Metadata } from "next";
import Link from "next/link";

// Public page: describes the partnership, never the fee itself. Partners see
// their exact rate when they sign up and on their Billing page.

export const metadata: Metadata = {
  title: "Pricing",
  description: "No monthly fees, no subscriptions. We only grow when your courts are full.",
};

const pillars = [
  { title: "No monthly fees", body: "No subscription and no contract. There's no bill just for being listed." },
  { title: "₱0 on quiet days", body: "Rainy week? Off season? If nobody books, you pay nothing." },
  { title: "We grow together", body: "We do well only when your courts are busy, so we work to keep them that way." },
];

const faqs = [
  { q: "What if I get no bookings this month?", a: "You pay nothing." },
  { q: "Is there a setup fee or a minimum?", a: "No setup fee, no minimum, and no lock-in. Create your page and start taking bookings today." },
  { q: "How does pricing work?", a: "You'll see exactly how it works when you create your page, before you agree to anything." },
  { q: "What about cancelled bookings?", a: "Cancelled bookings never cost you anything." },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-emerald-950 text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(190,242,100,0.22),transparent_45%)]" />
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">Pricing for courts and facilities</p>
          <h1 className="mt-4 text-[2.25rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
            We only grow when <span className="text-lime-300">your courts are full</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/80 sm:text-lg">No monthly fees. No subscriptions. Quiet days cost you nothing.</p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-lime-300 px-6 py-3 font-semibold text-emerald-950 shadow-lg shadow-lime-300/20 hover:bg-lime-200"
          >
            Create your booking page
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <ul className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {pillars.map((p) => (
            <li key={p.title} className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-black/60">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
        <dl className="mt-6 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white shadow-sm">
          {faqs.map((f) => (
            <div key={f.q} className="p-5">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-sm text-black/60">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
