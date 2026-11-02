import type { Metadata } from "next";
import Link from "next/link";
import { platform } from "@/lib/facility";
import { listVenues } from "@/lib/venues";
import VenueList from "../venue-list";

export const metadata: Metadata = {
  title: "Find a venue",
  description: `Courts and sports halls you can book online on ${platform.name}. Find the ones near you.`,
};

/** Every venue, with search, "Near me" and a map. The home page shows only the most-booked few. */
export default async function VenuesPage() {
  const venues = await listVenues();
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Find a venue</h1>
      <p className="mt-3 text-black/60">Book a court at a venue already taking bookings on {platform.name}.</p>
      {venues.length > 0 ? (
        <VenueList venues={venues} />
      ) : (
        <p className="mt-8 text-black/60">
          No venues yet.{" "}
          <Link href="/signup" className="font-semibold text-emerald-700 hover:underline">
            Run a court? List it here.
          </Link>
        </p>
      )}
    </section>
  );
}
