"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export type Venue = {
  id: string;
  name: string;
  handle: string;
  href: string;
  tagline: string;
  address: string;
  /** First banner photo, if the business uploaded one. */
  cover?: string;
  /** Bookable activities, e.g. "🏓 Pickleball". */
  activities: string[];
};

/** Show the search box once the list is longer than this. */
const SEARCH_FROM = 6;

/** The venue cards on the home page, with a search box once there are enough to need one. */
export default function VenueList({ venues }: { venues: Venue[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? venues.filter((v) => [v.name, v.handle, v.tagline, v.address, ...v.activities].some((s) => s.toLowerCase().includes(q)))
    : venues;

  return (
    <>
      {venues.length > SEARCH_FROM && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city or sport"
          aria-label="Search venues"
          className="mt-6 w-full rounded-xl border border-black/10 bg-[#f7f8f4] px-4 py-3 sm:max-w-sm"
        />
      )}
      {shown.length === 0 ? (
        <p className="mt-6 text-black/60">No venues match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {shown.map((v) => (
            <li key={v.id}>
              <Link
                href={v.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-[#f7f8f4] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {v.cover ? (
                  <span className="relative h-32">
                    <Image src={v.cover} alt="" fill unoptimized sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                  </span>
                ) : (
                  <span className="grid h-32 place-items-center bg-gradient-to-br from-lime-400 to-emerald-600 text-4xl font-bold text-white" aria-hidden>
                    {v.name.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="truncate text-lg font-semibold">{v.name}</h3>
                  <p className="truncate text-sm text-black/60">@{v.handle}</p>
                  {v.tagline && <p className="mt-2 text-sm text-black/70">{v.tagline}</p>}
                  {v.address && <p className="mt-1 text-sm text-black/60">{v.address}</p>}
                  {v.activities.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {v.activities.map((a) => (
                        <li key={a} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-black/70">
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-auto pt-4 text-sm font-semibold text-emerald-700 group-hover:underline">Book →</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
