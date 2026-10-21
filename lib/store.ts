import { randomBytes } from "node:crypto";
import {
  defaultActivities,
  defaultPaymentSettings,
  type Activity,
  type PastEvent,
  type PaymentSettings,
} from "./facility";
import { defaultHeroDoc, type HeroDoc } from "./hero";
import { fileStore } from "./store-file";
import { databaseUrl, postgresStore } from "./store-postgres";
import type { Booking, BookingFilter, InsertOwnerResult, Owner, StoreBackend } from "./store-types";

// The app's only way to read and write data. Picks a backend:
//   - Postgres when DATABASE_URL / POSTGRES_URL is set (required on Vercel)
//   - JSON files in ./data otherwise (local development, zero setup)
//
// Everything except accounts and booking-link lookups is scoped to one owner,
// so one business can never read or change another's data.

export type { Booking, BookingStatus, EmailKind, EmailLogEntry, Owner } from "./store-types";
export { deleteUpload, isUploadName, readUpload, saveUpload, UPLOAD_TYPES } from "./uploads";

function backend(): StoreBackend {
  if (databaseUrl()) return postgresStore;
  if (process.env.VERCEL) {
    throw new Error("No database configured. On Vercel, connect a Postgres database (e.g. Neon) so DATABASE_URL is set.");
  }
  return fileStore;
}

/** Whether a booking still occupies its court (anything but cancelled). */
export function holdsSlot(b: Pick<Booking, "status">) {
  return b.status !== "cancelled";
}

// ---- Owners ---------------------------------------------------------------

export function listOwners() {
  return backend().listOwners();
}

export function getOwnerById(id: string) {
  return backend().findOwner("id", id);
}

export function getOwnerByHandle(handle: string) {
  return backend().findOwner("handle", handle.toLowerCase());
}

export function getOwnerByEmail(email: string) {
  return backend().findOwner("email", email.trim().toLowerCase());
}

export type NewOwner = Omit<Owner, "id" | "createdAt">;

/** Creates an account with its own settings, or says which unique field is taken. */
export async function insertOwner(input: NewOwner): Promise<{ result: InsertOwnerResult; owner?: Owner }> {
  const owner: Owner = { ...input, id: randomBytes(6).toString("hex"), createdAt: new Date().toISOString() };
  const result = await backend().insertOwner(owner);
  return result === "ok" ? { result, owner } : { result };
}

export function updateOwner(id: string, change: (o: Owner) => void) {
  return backend().updateOwner(id, change);
}

// ---- Bookings -------------------------------------------------------------

export function listBookings(filter: BookingFilter) {
  return backend().listBookings(filter);
}

/** Looks a booking up by its confirmation-link token, never by its short reference. */
export async function getBookingByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return undefined;
  return backend().findBooking("accessToken", token);
}

export type NewBooking = Omit<Booking, "id" | "status" | "createdAt">;

/** Inserts a pending booking unless it overlaps an active one on the same court. */
export async function insertBooking(input: NewBooking): Promise<Booking | null> {
  for (let attempt = 0; ; attempt++) {
    const booking: Booking = {
      ...input,
      id: randomBytes(4).toString("hex").toUpperCase(),
      accessToken: randomBytes(24).toString("base64url"),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      return (await backend().insertBooking(booking)) ? booking : null;
    } catch (err) {
      // Postgres unique violation: the random reference already exists. Try another.
      if ((err as { code?: string }).code === "23505" && attempt < 3) continue;
      throw err;
    }
  }
}

class NotYours extends Error {}

/**
 * Applies `change` to one of the owner's bookings atomically. Returns null if
 * the booking doesn't exist or belongs to someone else. `change` may throw to
 * abort (e.g. when the booking is in the wrong state); nothing is written then.
 */
export async function updateBooking(ownerId: string, id: string, change: (b: Booking) => void) {
  try {
    return await backend().updateBooking(id, (b) => {
      if (b.ownerId !== ownerId) throw new NotYours();
      change(b);
    });
  } catch (err) {
    if (err instanceof NotYours) return null;
    throw err;
  }
}

// ---- Activities -----------------------------------------------------------
// Until an owner saves their first change, the defaults from lib/facility.ts are used.

export function readActivities(ownerId: string): Promise<Activity[]> {
  return backend().readDoc(ownerId, "activities", structuredClone(defaultActivities));
}

/** Inserts or replaces the activity with the same slug. */
export function upsertActivity(ownerId: string, activity: Activity): Promise<void> {
  return backend().updateDoc(ownerId, "activities", structuredClone(defaultActivities), (all) => {
    const i = all.findIndex((a) => a.slug === activity.slug);
    if (i === -1) all.push(activity);
    else all[i] = activity;
    return { doc: all, result: undefined };
  });
}

export function deleteActivity(ownerId: string, slug: string): Promise<void> {
  return backend().updateDoc(ownerId, "activities", structuredClone(defaultActivities), (all) => ({
    doc: all.filter((a) => a.slug !== slug),
    result: undefined,
  }));
}

export function moveActivity(ownerId: string, slug: string, direction: -1 | 1): Promise<void> {
  return backend().updateDoc(ownerId, "activities", structuredClone(defaultActivities), (all) => {
    const i = all.findIndex((a) => a.slug === slug);
    const j = i + direction;
    if (i !== -1 && j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]];
    return { doc: all, result: undefined };
  });
}

// ---- Past events ----------------------------------------------------------

export function readEvents(ownerId: string): Promise<PastEvent[]> {
  return backend().readDoc<PastEvent[]>(ownerId, "events", []);
}

/** Inserts or replaces the event with the same id. Returns the previous version. */
export function upsertEvent(ownerId: string, event: PastEvent): Promise<PastEvent | undefined> {
  return backend().updateDoc<PastEvent[], PastEvent | undefined>(ownerId, "events", [], (all) => {
    const i = all.findIndex((e) => e.id === event.id);
    const previous = i === -1 ? undefined : all[i];
    if (i === -1) all.push(event);
    else all[i] = event;
    return { doc: all, result: previous };
  });
}

export function deleteEvent(ownerId: string, id: string): Promise<PastEvent | undefined> {
  return backend().updateDoc<PastEvent[], PastEvent | undefined>(ownerId, "events", [], (all) => ({
    doc: all.filter((e) => e.id !== id),
    result: all.find((e) => e.id === id),
  }));
}

// ---- Payment settings -----------------------------------------------------

export async function readSettings(ownerId: string): Promise<PaymentSettings> {
  return { ...defaultPaymentSettings, ...(await backend().readDoc<Partial<PaymentSettings>>(ownerId, "settings", {})) };
}

export function writeSettings(ownerId: string, settings: PaymentSettings): Promise<void> {
  return backend().updateDoc<Partial<PaymentSettings>, void>(ownerId, "settings", {}, () => ({ doc: settings, result: undefined }));
}

// ---- Page banner ----------------------------------------------------------

export function readHero(ownerId: string): Promise<HeroDoc> {
  return backend().readDoc(ownerId, "hero", defaultHeroDoc());
}

/** Atomic read-modify-write of the owner's banner settings and photo library. */
export function updateHero<R>(ownerId: string, change: (doc: HeroDoc) => R): Promise<R> {
  return backend().updateDoc(ownerId, "hero", defaultHeroDoc(), (doc) => ({ doc, result: change(doc) }));
}

// ---- Login rate limiting --------------------------------------------------

export function getLoginFailure(ip: string) {
  return backend().getLoginFailure(ip);
}

export function recordLoginFailure(ip: string, lockMs: number) {
  return backend().recordLoginFailure(ip, lockMs);
}

export function clearLoginFailures(ip: string) {
  return backend().clearLoginFailures(ip);
}
