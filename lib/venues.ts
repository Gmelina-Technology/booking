import { cacheLife } from "next/cache";
import { getActiveActivities } from "./activities";
import { getHeroSettings } from "./banner";
import { getListedOwners, ownerPath, type PublicOwner } from "./owners";
import { countBookingsByOwner } from "./store";

// The public venue directory: every venue at /venues, the most-booked few on the home page.

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
  /** Map pin, once the business placed one. */
  lat?: number;
  lng?: number;
};

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
    lat: o.profile.lat,
    lng: o.profile.lng,
    cover: hero.images[0] && `/uploads/${hero.images[0]}`,
    activities: activities.map((a) => `${a.emoji} ${a.name}`.trim()),
  };
}

/** Bookings per venue for ranking. Refreshed every few hours: popularity doesn't need to be live. */
async function getBookingCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  return countBookingsByOwner();
}

/** Every venue, oldest first. */
export async function listVenues(): Promise<Venue[]> {
  return Promise.all((await getListedOwners()).map(toVenue));
}

/** The `count` most-booked venues (ties go to the older venue). */
export async function popularVenues(count: number): Promise<Venue[]> {
  const [owners, bookings] = await Promise.all([getListedOwners(), getBookingCounts()]);
  const top = owners
    .map((o, i) => ({ o, i, n: bookings[o.id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, count);
  return Promise.all(top.map(({ o }) => toVenue(o)));
}
