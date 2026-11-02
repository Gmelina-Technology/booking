"use client";

import { useMemo, useState } from "react";
import { haversineKm, type LatLng } from "@/lib/geo";
import type { Venue } from "@/lib/venues";
import VenueCard from "./venue-card";
import VenueMap from "./venue-map";

/** Show the search box once the list is longer than this. */
const SEARCH_FROM = 6;

const pinOf = (v: Venue): LatLng | null => (v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null);

/** Every venue card on /venues, with a search box once there are enough to need one, and "Near me" once any venue is on the map. */
export default function VenueList({ venues }: { venues: Venue[] }) {
  const [query, setQuery] = useState("");
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const pinned = useMemo(() => venues.flatMap((v) => { const p = pinOf(v); return p ? [{ ...v, ...p }] : []; }), [venues]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? venues.filter((v) => [v.name, v.handle, v.tagline, v.address, ...v.activities].some((s) => s.toLowerCase().includes(q)))
    : venues;
  // Nearest first once we know where the player is; venues without a pin go last.
  const distance = (v: Venue) => { const p = pinOf(v); return here && p ? haversineKm(here, p) : undefined; };
  const shown = here
    ? matches.map((v) => ({ v, km: distance(v) })).sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
    : matches.map((v) => ({ v, km: undefined }));

  function nearMe() {
    if (!navigator.geolocation) return setLocError("Your browser can't share your location. Search by city instead.");
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      (e) => {
        setLocError(
          e.code === e.PERMISSION_DENIED
            ? "Location is blocked. Allow it for this site in your browser, or search by city instead."
            : "Couldn't get your location. Try again, or search by city instead.",
        );
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {venues.length > SEARCH_FROM && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city or sport"
            aria-label="Search venues"
            className="w-full rounded-xl border border-black/10 bg-[#f7f8f4] px-4 py-3 sm:max-w-sm"
          />
        )}
        {pinned.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={nearMe}
              disabled={locating}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {locating ? "Finding you…" : here ? "Update my location" : "Near me"}
            </button>
            <div role="group" aria-label="View" className="flex rounded-xl border border-black/10 p-1 text-sm">
              {(["list", "map"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={view === k}
                  onClick={() => setView(k)}
                  className={`rounded-lg px-3 py-1.5 font-medium capitalize ${view === k ? "bg-emerald-950 text-white" : "text-black/60 hover:bg-black/5"}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {locError && <p role="status" className="mt-3 text-sm text-red-700">{locError}</p>}
      {here && !locError && <p role="status" className="mt-3 text-sm text-black/60">Showing the nearest venues first.</p>}
      {view === "map" && pinned.length > 0 ? (
        <VenueMap venues={pinned} here={here} />
      ) : shown.length === 0 ? (
        <p className="mt-6 text-black/60">No venues match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {shown.map(({ v, km }) => (
            <li key={v.id}>
              <VenueCard venue={v} km={km} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
