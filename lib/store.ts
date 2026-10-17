import { randomBytes } from "node:crypto";
import {
  defaultActivities,
  defaultEvents,
  defaultPaymentSettings,
  type Activity,
  type PastEvent,
  type PaymentSettings,
} from "./facility";
import { fileStore } from "./store-file";
import { databaseUrl, postgresStore } from "./store-postgres";
import type { Booking, BookingFilter, StoreBackend } from "./store-types";

// The app's only way to read and write data. Picks a backend:
//   - Postgres when DATABASE_URL / POSTGRES_URL is set (required on Vercel)
//   - JSON files in ./data otherwise (local development, zero setup)

export type { Booking, BookingStatus, EmailKind, EmailLogEntry } from "./store-types";
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

// ---- Bookings -------------------------------------------------------------

export function listBookings(filter: BookingFilter = {}) {
  return backend().listBookings(filter);
}

/** Staff lookup by short reference. */
export function getBooking(id: string) {
  return backend().findBooking("id", id);
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

/**
 * Applies `change` to the booking atomically. `change` may throw to abort
 * (e.g. when the booking is in the wrong state); nothing is written then.
 */
export function updateBooking(id: string, change: (b: Booking) => void) {
  return backend().updateBooking(id, change);
}

// ---- Activities -----------------------------------------------------------
// Until staff save their first change, the defaults from lib/facility.ts are used.

export function readActivities(): Promise<Activity[]> {
  return backend().readDoc("activities", structuredClone(defaultActivities));
}

/** Inserts or replaces the activity with the same slug. */
export function upsertActivity(activity: Activity): Promise<void> {
  return backend().updateDoc("activities", structuredClone(defaultActivities), (all) => {
    const i = all.findIndex((a) => a.slug === activity.slug);
    if (i === -1) all.push(activity);
    else all[i] = activity;
    return { doc: all, result: undefined };
  });
}

export function deleteActivity(slug: string): Promise<void> {
  return backend().updateDoc("activities", structuredClone(defaultActivities), (all) => ({
    doc: all.filter((a) => a.slug !== slug),
    result: undefined,
  }));
}

export function moveActivity(slug: string, direction: -1 | 1): Promise<void> {
  return backend().updateDoc("activities", structuredClone(defaultActivities), (all) => {
    const i = all.findIndex((a) => a.slug === slug);
    const j = i + direction;
    if (i !== -1 && j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]];
    return { doc: all, result: undefined };
  });
}

// ---- Past events ----------------------------------------------------------

export function readEvents(): Promise<PastEvent[]> {
  return backend().readDoc("events", structuredClone(defaultEvents));
}

/** Inserts or replaces the event with the same id. Returns the previous version. */
export function upsertEvent(event: PastEvent): Promise<PastEvent | undefined> {
  return backend().updateDoc("events", structuredClone(defaultEvents), (all) => {
    const i = all.findIndex((e) => e.id === event.id);
    const previous = i === -1 ? undefined : all[i];
    if (i === -1) all.push(event);
    else all[i] = event;
    return { doc: all, result: previous };
  });
}

export function deleteEvent(id: string): Promise<PastEvent | undefined> {
  return backend().updateDoc("events", structuredClone(defaultEvents), (all) => ({
    doc: all.filter((e) => e.id !== id),
    result: all.find((e) => e.id === id),
  }));
}

// ---- Payment settings -----------------------------------------------------

export async function readSettings(): Promise<PaymentSettings> {
  return { ...defaultPaymentSettings, ...(await backend().readDoc<Partial<PaymentSettings>>("settings", {})) };
}

export function writeSettings(settings: PaymentSettings): Promise<void> {
  return backend().updateDoc<Partial<PaymentSettings>, void>("settings", {}, () => ({ doc: settings, result: undefined }));
}

// ---- Staff login rate limiting ---------------------------------------------

export function getLoginFailure(ip: string) {
  return backend().getLoginFailure(ip);
}

export function recordLoginFailure(ip: string, lockMs: number) {
  return backend().recordLoginFailure(ip, lockMs);
}

export function clearLoginFailures(ip: string) {
  return backend().clearLoginFailures(ip);
}
