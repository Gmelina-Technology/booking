import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultActivities, defaultEvents, type Activity, type PastEvent } from "./facility";

// A small JSON-file store so the site runs with zero setup. Swap this module
// for a real database (Postgres, MySQL, SQLite…) before going to production —
// the rest of the app only talks to the functions exported here.

export type BookingStatus = "confirmed" | "cancelled";

export type Booking = {
  id: string;
  activitySlug: string;
  resourceId: string;
  date: string;
  startHour: number;
  hours: number;
  name: string;
  email: string;
  phone: string;
  players: number;
  notes: string;
  total: number;
  status: BookingStatus;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

const readAll = () => readJson<Booking[]>(BOOKINGS_FILE, []);
const writeAll = (bookings: Booking[]) => writeJson(BOOKINGS_FILE, bookings);

// Serialize writes so two requests can't book the same slot (or overwrite
// each other's activity edits) at once.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export function overlaps(a: { startHour: number; hours: number }, b: { startHour: number; hours: number }) {
  return a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours;
}

export async function listBookings(filter: { activitySlug?: string; date?: string } = {}) {
  const all = await readAll();
  return all
    .filter((b) => (!filter.activitySlug || b.activitySlug === filter.activitySlug) && (!filter.date || b.date === filter.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
}

export async function getBooking(id: string) {
  return (await readAll()).find((b) => b.id === id);
}

export type NewBooking = Omit<Booking, "id" | "status" | "createdAt">;

/** Inserts the booking unless it overlaps a confirmed one on the same resource. */
export function insertBooking(input: NewBooking): Promise<Booking | null> {
  return exclusive(async () => {
    const all = await readAll();
    const clash = all.some(
      (b) =>
        b.status === "confirmed" &&
        b.activitySlug === input.activitySlug &&
        b.resourceId === input.resourceId &&
        b.date === input.date &&
        overlaps(b, input),
    );
    if (clash) return null;

    const booking: Booking = {
      ...input,
      id: randomBytes(4).toString("hex").toUpperCase(),
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    await writeAll([...all, booking]);
    return booking;
  });
}

export function setBookingStatus(id: string, status: BookingStatus): Promise<Booking | null> {
  return exclusive(async () => {
    const all = await readAll();
    const booking = all.find((b) => b.id === id);
    if (!booking) return null;
    booking.status = status;
    await writeAll(all);
    return booking;
  });
}

// ---- Activities -----------------------------------------------------------
// Until staff save their first change, the defaults from lib/facility.ts are used.

export function readActivities(): Promise<Activity[]> {
  return readJson<Activity[]>(ACTIVITIES_FILE, structuredClone(defaultActivities));
}

/** Inserts or replaces the activity with the same slug. */
export function upsertActivity(activity: Activity): Promise<void> {
  return exclusive(async () => {
    const all = await readActivities();
    const i = all.findIndex((a) => a.slug === activity.slug);
    if (i === -1) all.push(activity);
    else all[i] = activity;
    await writeJson(ACTIVITIES_FILE, all);
  });
}

export function deleteActivity(slug: string): Promise<void> {
  return exclusive(async () => {
    const all = await readActivities();
    await writeJson(ACTIVITIES_FILE, all.filter((a) => a.slug !== slug));
  });
}

export function moveActivity(slug: string, direction: -1 | 1): Promise<void> {
  return exclusive(async () => {
    const all = await readActivities();
    const i = all.findIndex((a) => a.slug === slug);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    await writeJson(ACTIVITIES_FILE, all);
  });
}

// ---- Past events ----------------------------------------------------------

export function readEvents(): Promise<PastEvent[]> {
  return readJson<PastEvent[]>(EVENTS_FILE, structuredClone(defaultEvents));
}

/** Inserts or replaces the event with the same id. */
export function upsertEvent(event: PastEvent): Promise<PastEvent | undefined> {
  return exclusive(async () => {
    const all = await readEvents();
    const i = all.findIndex((e) => e.id === event.id);
    const previous = i === -1 ? undefined : all[i];
    if (i === -1) all.push(event);
    else all[i] = event;
    await writeJson(EVENTS_FILE, all);
    return previous;
  });
}

export function deleteEvent(id: string): Promise<PastEvent | undefined> {
  return exclusive(async () => {
    const all = await readEvents();
    const event = all.find((e) => e.id === id);
    await writeJson(EVENTS_FILE, all.filter((e) => e.id !== id));
    return event;
  });
}

// ---- Uploaded photos ------------------------------------------------------

export const UPLOAD_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Only names we generated ourselves are valid, so paths can't escape the folder. */
export function isUploadName(name: string) {
  return /^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name);
}

export async function saveUpload(data: Buffer, ext: string): Promise<string> {
  const name = `${randomBytes(8).toString("hex")}.${ext}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, name), data);
  return name;
}

export async function readUpload(name: string): Promise<Buffer | null> {
  if (!isUploadName(name)) return null;
  try {
    return await readFile(path.join(UPLOADS_DIR, name));
  } catch {
    return null;
  }
}

export async function deleteUpload(name: string): Promise<void> {
  if (isUploadName(name)) await unlink(path.join(UPLOADS_DIR, name)).catch(() => {});
}
