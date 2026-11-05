// Times, spots and labels for hosted events (open play, workshops, tournaments).
// Shared by the store, server actions and client components, so pure functions
// only (tests/hosted-events.test.ts).
//
// Event times are minutes after midnight on the half hour. Courts are booked by
// the whole hour, so an event holds every hour it touches: 7:30–9:00 PM holds
// 7–9 PM. Registrations carry the same whole hours, and the exact times in
// `startMinute` / `endMinute`.

import { formatHourRange, platform, type Activity, type HostedEvent, type HostedEventKind } from "./facility";
import type { Booking } from "./store-types";
import { facilityInstant } from "./time";

export const EVENT_KINDS: { kind: HostedEventKind; label: string; unit: string }[] = [
  { kind: "open_play", label: "Open play", unit: "player" },
  { kind: "workshop", label: "Workshop", unit: "player" },
  { kind: "tournament", label: "Tournament", unit: "team" },
];

export const kindLabel = (kind: HostedEventKind) => EVENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** "player" or "team", for "3 spots left" style copy. */
export const spotUnit = (kind: HostedEventKind) => EVENT_KINDS.find((k) => k.kind === kind)?.unit ?? "spot";

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "7:30 PM" */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatMinuteRange(start: number, end: number): string {
  return `${formatMinute(start)} – ${formatMinute(end)}`;
}

/** The whole court hours an event holds: from the hour it starts in to the hour it ends in, rounded up. */
export function heldHours(e: Pick<HostedEvent, "startMinute" | "endMinute">): { startHour: number; hours: number } {
  const startHour = Math.floor(e.startMinute / 60);
  return { startHour, hours: Math.ceil(e.endMinute / 60) - startHour };
}

/** A booking's time: exact for hosted events, otherwise its whole hours. */
export function bookingTime(b: Pick<Booking, "startHour" | "hours" | "startMinute" | "endMinute">): string {
  return b.startMinute !== undefined && b.endMinute !== undefined
    ? formatMinuteRange(b.startMinute, b.endMinute)
    : formatHourRange(b.startHour, b.hours);
}

/** A registration for a hosted event (not one of the courts it holds). */
export const isRegistration = (b: Pick<Booking, "eventId" | "blocked">) => !!b.eventId && !b.blocked;

/** A court a hosted event holds. Staff change it through the event, not as a booking. */
export const isEventHold = (b: Pick<Booking, "eventId" | "blocked">) => !!b.eventId && !!b.blocked;

/** Where a booking is: the court, or the event's title for a registration. */
export function bookingPlace(b: Pick<Booking, "resourceId" | "eventId" | "blocked" | "eventTitle">, activity?: Pick<Activity, "resources">): string {
  if (isRegistration(b)) return b.eventTitle ?? "Event";
  return activity?.resources.find((r) => r.id === b.resourceId)?.name ?? b.resourceId;
}

/** Spots the event's active registrations take. */
export function spotsTaken(bookings: Pick<Booking, "eventId" | "blocked" | "status" | "spots">[], eventId: string): number {
  return bookings
    .filter((b) => b.eventId === eventId && !b.blocked && b.status !== "cancelled")
    .reduce((sum, b) => sum + (b.spots ?? 1), 0);
}

/** When registration closes, as an ISO time. */
export function closesAt(e: Pick<HostedEvent, "date" | "startMinute" | "closeHoursBefore">): string {
  return new Date(facilityInstant(e.date, e.startMinute) - e.closeHoursBefore * 3600_000).toISOString();
}

/** "Tue, Jan 15, 5:30 PM" in the facility's time zone. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString(platform.locale, {
    timeZone: platform.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whether an ISO time has passed. */
export function isPast(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) <= now;
}

/** Whether the event's end has passed. */
export function hasEnded(e: Pick<HostedEvent, "date" | "endMinute">, now = Date.now()): boolean {
  return facilityInstant(e.date, e.endMinute) <= now;
}

export type RegistrationState = "open" | "full" | "closed" | "cancelled" | "draft";

/** Whether players can register now. Pausing and suspension are checked separately (lib/owners.ts). */
export function registrationState(e: HostedEvent, taken: number, now = Date.now()): RegistrationState {
  if (e.status === "draft") return "draft";
  if (e.status === "cancelled") return "cancelled";
  if (Date.parse(closesAt(e)) <= now) return "closed";
  if (taken >= e.capacity) return "full";
  return "open";
}

/** What one registration costs before the booking fee: per player, or one price per team. */
export function registrationPrice(e: Pick<HostedEvent, "kind" | "price">, spots: number): number {
  return e.kind === "tournament" ? e.price : e.price * spots;
}
