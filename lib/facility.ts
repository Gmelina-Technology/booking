// Facility configuration. Edit this file to rebrand the site. Activities are
// managed by staff at /admin/activities; `defaultActivities` only seeds them.

export type Resource = { id: string; name: string };

export type Activity = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  /** One of `gradients` below (Tailwind classes for the card header). */
  gradient: string;
  /** Hidden from customers when false. Existing bookings are kept. */
  active: boolean;
  pricePerHour: number;
  /** Opening hour (inclusive) and closing hour (exclusive), 24h clock. */
  openHour: number;
  closeHour: number;
  maxHoursPerBooking: number;
  maxPlayers: number;
  resourceLabel: string;
  resources: Resource[];
  includes: string[];
};

export const facility = {
  name: "Courtside Hub",
  tagline: "Courts, tables and lanes — book in under a minute.",
  address: "123 Rizal Avenue, Makati City",
  phone: "+63 917 000 0000",
  email: "hello@courtsidehub.ph",
  timeZone: "Asia/Manila",
  currency: "PHP",
  locale: "en-PH",
  /** How many days ahead customers can book. */
  bookingWindowDays: 14,
};

function numbered(prefix: string, label: string, count: number): Resource[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `${label} ${i + 1}`,
  }));
}

/** Colour choices for activity cards. Classes are listed in full so Tailwind generates them. */
export const gradients = [
  { name: "Lime", className: "from-lime-400 to-emerald-600" },
  { name: "Sky", className: "from-sky-400 to-indigo-600" },
  { name: "Sunshine", className: "from-yellow-300 to-orange-500" },
  { name: "Fire", className: "from-orange-400 to-red-600" },
  { name: "Berry", className: "from-rose-400 to-fuchsia-600" },
  { name: "Ocean", className: "from-cyan-400 to-blue-600" },
  { name: "Violet", className: "from-violet-400 to-purple-700" },
  { name: "Slate", className: "from-slate-500 to-slate-800" },
];

export const defaultActivities: Activity[] = [
  {
    slug: "pickleball",
    name: "Pickleball",
    tagline: "The fastest-growing sport in town",
    description:
      "Four dedicated indoor pickleball courts with cushioned flooring, permanent nets and LED lighting. Great for doubles, drills and open play.",
    emoji: "🏓",
    gradient: "from-lime-400 to-emerald-600",
    active: true,
    pricePerHour: 400,
    openHour: 6,
    closeHour: 22,
    maxHoursPerBooking: 3,
    maxPlayers: 4,
    resourceLabel: "Court",
    resources: numbered("pb", "Court", 4),
    includes: ["Paddle rental available", "Indoor, air-conditioned", "Ball provided"],
  },
  {
    slug: "badminton",
    name: "Badminton",
    tagline: "Tournament-grade synthetic courts",
    description:
      "Six badminton courts with BWF-spec synthetic mats and high ceilings. Ideal for casual games, club nights and training.",
    emoji: "🏸",
    gradient: "from-sky-400 to-indigo-600",
    active: true,
    pricePerHour: 300,
    openHour: 6,
    closeHour: 23,
    maxHoursPerBooking: 3,
    maxPlayers: 4,
    resourceLabel: "Court",
    resources: numbered("bd", "Court", 6),
    includes: ["Racket rental available", "Anti-slip mats", "Shuttle vending"],
  },
  {
    slug: "tennis",
    name: "Tennis",
    tagline: "Outdoor hard courts under lights",
    description:
      "Two outdoor hard courts with night lighting. Book a singles hit or a doubles session — ball machine available on request.",
    emoji: "🎾",
    gradient: "from-yellow-300 to-orange-500",
    active: true,
    pricePerHour: 550,
    openHour: 6,
    closeHour: 21,
    maxHoursPerBooking: 2,
    maxPlayers: 4,
    resourceLabel: "Court",
    resources: numbered("tn", "Court", 2),
    includes: ["Night lighting", "Ball machine on request", "Shaded benches"],
  },
  {
    slug: "basketball",
    name: "Basketball",
    tagline: "Full court for your squad",
    description:
      "One full-size indoor basketball court with glass backboards and a scoreboard. Perfect for pickup games, team practice and leagues.",
    emoji: "🏀",
    gradient: "from-orange-400 to-red-600",
    active: true,
    pricePerHour: 1200,
    openHour: 7,
    closeHour: 22,
    maxHoursPerBooking: 3,
    maxPlayers: 20,
    resourceLabel: "Court",
    resources: [{ id: "bb-1", name: "Full court" }],
    includes: ["Scoreboard", "Glass backboards", "Bibs available"],
  },
  {
    slug: "table-tennis",
    name: "Table Tennis",
    tagline: "Quick rallies, any time",
    description:
      "Four competition tables in a dedicated hall. Drop in for a quick match or book a few hours of practice.",
    emoji: "🏓",
    gradient: "from-rose-400 to-fuchsia-600",
    active: true,
    pricePerHour: 150,
    openHour: 8,
    closeHour: 22,
    maxHoursPerBooking: 3,
    maxPlayers: 4,
    resourceLabel: "Table",
    resources: numbered("tt", "Table", 4),
    includes: ["Paddles provided", "Competition tables", "Air-conditioned"],
  },
];

/** A past event shown on the home page as social proof. Managed at /admin/events. */
export type PastEvent = {
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** Activity it featured, used for the fallback card colour and icon. */
  activitySlug: string;
  summary: string;
  /** Number of players/guests, shown as a badge. 0 hides it. */
  participants: number;
  /** File name in the uploads store, served at /uploads/<photo>. */
  photo: string | null;
  published: boolean;
  /** Set on the built-in placeholder events; cleared once staff save the event. */
  sample?: boolean;
};

// Placeholder examples so the section isn't empty on a fresh install.
// Replace them with the client's real events (or delete them) before launch.
export const defaultEvents: PastEvent[] = [
  {
    id: "sample-1",
    title: "Pickleball Open Doubles",
    date: "2026-09-20",
    activitySlug: "pickleball",
    summary: "A full day of doubles across all four courts, from first-timers to club regulars.",
    participants: 48,
    photo: null,
    published: true,
    sample: true,
  },
  {
    id: "sample-2",
    title: "Junior Badminton Clinic",
    date: "2026-08-15",
    activitySlug: "badminton",
    summary: "Weekend coaching for ages 8–15, covering footwork, grips and match play.",
    participants: 24,
    photo: null,
    published: true,
    sample: true,
  },
  {
    id: "sample-3",
    title: "Corporate Sports Day",
    date: "2026-07-26",
    activitySlug: "basketball",
    summary: "Full facility booking for a team-building day: 3x3 basketball, table tennis and pickleball.",
    participants: 120,
    photo: null,
    published: true,
    sample: true,
  },
];

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(facility.locale, {
    style: "currency",
    currency: facility.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatHour(hour: number): string {
  const h = hour % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

export function formatHourRange(start: number, hours: number): string {
  return `${formatHour(start)} – ${formatHour(start + hours)}`;
}
