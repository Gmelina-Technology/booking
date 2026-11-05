import { randomBytes } from "node:crypto";
import {
  defaultActivities,
  defaultPaymentSettings,
  type Activity,
  type HostedEvent,
  type PastEvent,
  type PaymentSettings,
} from "./facility";
import { emptySchedule, type FeeSchedule } from "./fees";
import { defaultHeroDoc, type HeroDoc } from "./hero";
import { PAGE_SIZE, pageWindow, type PageInfo } from "./paging";
import { fileStore } from "./store-file";
import { databaseUrl, postgresStore } from "./store-postgres";
import type {
  AppNotification,
  Booking,
  BookingFilter,
  InsertOwnerResult,
  Owner,
  PageBanner,
  PartnerLogEntry,
  PlatformBookingFilter,
  PlatformBookingSummary,
  PlatformNotification,
  StoreBackend,
  ViewAsLogEntry,
} from "./store-types";

// The app's only way to read and write data. Picks a backend:
//   - Postgres when DATABASE_URL / POSTGRES_URL is set (required on Vercel)
//   - JSON files in ./data otherwise (local development, zero setup)
//
// Everything except accounts and booking-link lookups is scoped to one owner,
// so one business can never read or change another's data. The exceptions,
// the *PlatformBookings() functions and readAll*(), are only for platform admin pages.

export type { Booking, BookingStatus, EmailKind, EmailLogEntry, Owner, PageBanner, PagePause, PartnerLogEntry, PlatformNotification, ViewAsLogEntry } from "./store-types";
export { SlotTaken } from "./store-types";
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

/** Deletes the account, its bookings and its documents. Delete its uploads first (see (staff)/app/account/actions.ts). */
export function deleteOwner(id: string) {
  return backend().deleteOwner(id);
}

// ---- Bookings -------------------------------------------------------------

export function listBookings(filter: BookingFilter) {
  return backend().listBookings(filter);
}

/** Every partner's bookings. Only for platform admin pages, which call requirePlatformAdmin() first. */
export function listPlatformBookings(filter: PlatformBookingFilter = {}) {
  return backend().listPlatformBookings(filter);
}

/**
 * One page of every partner's bookings, fetched from the backend a page at a
 * time, with where it sits in the whole list (see pageWindow()). Platform admin pages only.
 */
export async function pagePlatformBookings(filter: PlatformBookingFilter, page: number, size = PAGE_SIZE): Promise<PageInfo & { rows: Booking[] }> {
  const total = await backend().countPlatformBookings(filter);
  const { offset, ...info } = pageWindow(total, page, size);
  const rows = total ? await backend().listPlatformBookings({ ...filter, limit: size, offset }) : [];
  return { ...info, rows };
}

/** Each partner's booking numbers over the filter, worked out by the backend. Platform admin pages only. */
export function summarizePlatformBookings(filter: PlatformBookingFilter, today: string, nowMs = Date.now()): Promise<PlatformBookingSummary[]> {
  return backend().summarizePlatformBookings(filter, today, nowMs);
}

export function countBookingsByOwner() {
  return backend().countBookingsByOwner();
}

/** Looks a booking up by its confirmation-link token, never by its short reference. */
export async function getBookingByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return undefined;
  return backend().findBooking("accessToken", token);
}

export type NewBooking = Omit<Booking, "id" | "status" | "createdAt">;

function newBooking(input: NewBooking & { status?: Booking["status"] }): Booking {
  return {
    status: "pending",
    ...input,
    id: randomBytes(4).toString("hex").toUpperCase(),
    accessToken: randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
}

/** Retries `insert` with a fresh reference when the random one already exists (a Postgres unique violation). */
async function withFreshIds<T>(insert: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await insert();
    } catch (err) {
      if ((err as { code?: string }).code === "23505" && attempt < 3) continue;
      throw err;
    }
  }
}

/** Inserts a pending booking unless it overlaps an active one on the same court. */
export function insertBooking(input: NewBooking): Promise<Booking | null> {
  return withFreshIds(async () => {
    const booking = newBooking(input);
    return (await backend().insertBooking(booking)) ? booking : null;
  });
}

/** Inserts confirmed bookings all together, or none if any overlaps an active booking on its court. */
export function insertBookings(inputs: NewBooking[]): Promise<Booking[] | null> {
  return withFreshIds(async () => {
    const bookings = inputs.map((input) => newBooking({ ...input, status: "confirmed" }));
    return (await backend().insertBookings(bookings)) ? bookings : null;
  });
}

/** Inserts a registration for a hosted event (`eventId`, `spots`) if it fits in `capacity`. */
export function insertRegistration(input: NewBooking & { status: Booking["status"] }, capacity: number): Promise<Booking | "full"> {
  return withFreshIds(async () => {
    const booking = newBooking(input);
    return (await backend().insertRegistration(booking, capacity)) === "ok" ? booking : "full";
  });
}

class NotYours extends Error {}

/**
 * Applies `change` to one of the owner's bookings atomically. Returns null if
 * the booking doesn't exist or belongs to someone else. `change` may throw to
 * abort (e.g. when the booking is in the wrong state); nothing is written then.
 * Throws SlotTaken if a moved booking would overlap another on its court.
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

/** The activities of each of `ownerIds`, in one read. Platform admin pages only. */
export async function readAllActivities(ownerIds: string[]): Promise<Map<string, Activity[]>> {
  const docs = await backend().readDocs<Activity[]>("activities");
  return new Map(ownerIds.map((id) => [id, docs.get(id) ?? structuredClone(defaultActivities)]));
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

// ---- Hosted events --------------------------------------------------------

export function readHostedEvents(ownerId: string): Promise<HostedEvent[]> {
  return backend().readDoc<HostedEvent[]>(ownerId, "hosted-events", []);
}

/** Atomically changes the owner's hosted events. `change` may throw to abort; nothing is written then. */
export function updateHostedEvents<R>(ownerId: string, change: (all: HostedEvent[]) => R): Promise<R> {
  return backend().updateDoc<HostedEvent[], R>(ownerId, "hosted-events", [], (all) => {
    const result = change(all);
    return { doc: all, result };
  });
}

// ---- Payment settings -----------------------------------------------------

export async function readSettings(ownerId: string): Promise<PaymentSettings> {
  return { ...defaultPaymentSettings, ...(await backend().readDoc<Partial<PaymentSettings>>(ownerId, "settings", {})) };
}

/** The payment settings of each of `ownerIds`, in one read. Platform admin pages only. */
export async function readAllSettings(ownerIds: string[]): Promise<Map<string, PaymentSettings>> {
  const docs = await backend().readDocs<Partial<PaymentSettings>>("settings");
  return new Map(ownerIds.map((id) => [id, { ...defaultPaymentSettings, ...docs.get(id) }]));
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

// ---- Staff notifications --------------------------------------------------
// Newest first. lib/notifications.ts decides what goes in and how many are kept.

export function readNotifications(ownerId: string): Promise<AppNotification[]> {
  return backend().readDoc<AppNotification[]>(ownerId, "notifications", []);
}

/** Atomic read-modify-write of the owner's notifications. */
export function updateNotifications(ownerId: string, change: (all: AppNotification[]) => AppNotification[]): Promise<void> {
  return backend().updateDoc<AppNotification[], void>(ownerId, "notifications", [], (all) => ({ doc: change(all), result: undefined }));
}

// ---- Partner fee rates (platform-wide) -------------------------------------

export function readFeeSchedule(): Promise<FeeSchedule> {
  return backend().readPlatformDoc("fees", emptySchedule());
}

/** Atomic read-modify-write of the fee rate history. */
export function updateFeeSchedule<R>(change: (doc: FeeSchedule) => R): Promise<R> {
  return backend().updatePlatformDoc("fees", emptySchedule(), (doc) => ({ doc, result: change(doc) }));
}

// ---- Platform admins viewing as partners -----------------------------------
// Newest first, the latest VIEW_AS_LOG_SIZE kept.

const VIEW_AS_LOG_SIZE = 200;

export function readViewAsLog(): Promise<ViewAsLogEntry[]> {
  return backend().readPlatformDoc<ViewAsLogEntry[]>("view-as-log", []);
}

export function logViewAs(entry: ViewAsLogEntry): Promise<void> {
  return backend().updatePlatformDoc<ViewAsLogEntry[], void>("view-as-log", [], (all) => ({
    doc: [entry, ...all].slice(0, VIEW_AS_LOG_SIZE),
    result: undefined,
  }));
}

// ---- Platform admins suspending and reinstating partners -------------------
// Newest first, the latest PARTNER_LOG_SIZE kept.

const PARTNER_LOG_SIZE = 200;

export function readPartnerLog(): Promise<PartnerLogEntry[]> {
  return backend().readPlatformDoc<PartnerLogEntry[]>("partner-log", []);
}

export function logPartnerChange(entry: PartnerLogEntry): Promise<void> {
  return backend().updatePlatformDoc<PartnerLogEntry[], void>("partner-log", [], (all) => ({
    doc: [entry, ...all].slice(0, PARTNER_LOG_SIZE),
    result: undefined,
  }));
}

// ---- Platform admin notifications -----------------------------------------
// Newest first. lib/platform-notifications.ts decides what goes in and how many are kept.

export function readPlatformNotifications(): Promise<PlatformNotification[]> {
  return backend().readPlatformDoc<PlatformNotification[]>("notifications", []);
}

/** Atomic read-modify-write of the platform notifications. */
export function updatePlatformNotifications(change: (all: PlatformNotification[]) => PlatformNotification[]): Promise<void> {
  return backend().updatePlatformDoc<PlatformNotification[], void>("notifications", [], (all) => ({ doc: change(all), result: undefined }));
}

// ---- Page banners (platform-wide) -----------------------------------------
// Newest first. Until an admin changes them, the built-in ones from lib/page-banners.ts apply.

export function readPageBanners(fallback: PageBanner[]): Promise<PageBanner[]> {
  return backend().readPlatformDoc("page-banners", fallback);
}

/** Atomic read-modify-write of the page banners. */
export function updatePageBanners<R>(fallback: PageBanner[], change: (all: PageBanner[]) => R): Promise<R> {
  return backend().updatePlatformDoc("page-banners", fallback, (all) => ({ doc: all, result: change(all) }));
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

// ---- General rate limits --------------------------------------------------
// Reuses the login lockout table with a prefixed key (e.g. "signup-send:<ip>"),
// so limits hold across serverless instances without another table. Each hit
// extends the window; the count resets once the window passes without one.

export function getRateLimit(key: string) {
  return backend().getLoginFailure(key);
}

export function hitRateLimit(key: string, windowMs: number) {
  return backend().recordLoginFailure(key, windowMs);
}

export function clearRateLimit(key: string) {
  return backend().clearLoginFailures(key);
}
