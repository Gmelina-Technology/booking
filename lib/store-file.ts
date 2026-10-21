import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Booking, DocKind, LoginFailure, Owner, StoreBackend } from "./store-types";

// JSON files in ./data, for local development with zero setup. Single-process
// only: writes are serialized in memory, which doesn't work across serverless
// instances. Production on Vercel uses lib/store-postgres.ts instead.
//
//   data/owners.json                 every account
//   data/bookings.json               every booking (each has an ownerId)
//   data/owners/<id>/<kind>.json     an owner's activities, events and settings
//   data/<kind>.json                 data from before accounts existed, moved
//                                    into the first account when it signs up

const DATA_DIR = path.join(process.cwd(), "data");
const OWNERS_FILE = path.join(DATA_DIR, "owners.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const docFile = (ownerId: string, kind: DocKind) => path.join(DATA_DIR, "owners", ownerId, `${kind}.json`);
const legacyDocFile = (kind: DocKind) => path.join(DATA_DIR, `${kind}.json`);

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

const readAll = () => readJson<Booking[]>(BOOKINGS_FILE, []);
const writeAll = (bookings: Booking[]) => writeJson(BOOKINGS_FILE, bookings);
const readOwners = () => readJson<Owner[]>(OWNERS_FILE, []);

// Serialize writes so two requests can't book the same slot (or overwrite
// each other's edits) at once.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const overlaps = (a: Booking, b: Booking) => a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours;

/** Gives the first account the bookings and documents from before accounts existed. */
async function adoptLegacyData(ownerId: string) {
  const all = await readAll();
  if (all.some((b) => !b.ownerId)) {
    for (const b of all) b.ownerId ||= ownerId;
    await writeAll(all);
  }
  for (const kind of ["activities", "events", "settings"] as const) {
    await mkdir(path.dirname(docFile(ownerId, kind)), { recursive: true });
    await rename(legacyDocFile(kind), docFile(ownerId, kind)).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    });
  }
}

const loginFailures = new Map<string, LoginFailure>();

export const fileStore: StoreBackend = {
  listOwners() {
    return readOwners();
  },

  async findOwner(by, value) {
    return (await readOwners()).find((o) => o[by] === value);
  },

  insertOwner(owner) {
    return exclusive(async () => {
      const owners = await readOwners();
      if (owners.some((o) => o.handle === owner.handle)) return "handle_taken";
      if (owners.some((o) => o.email === owner.email)) return "email_taken";
      if (owners.length === 0) await adoptLegacyData(owner.id);
      await writeJson(OWNERS_FILE, [...owners, owner]);
      return "ok";
    });
  },

  updateOwner(id, change) {
    return exclusive(async () => {
      const owners = await readOwners();
      const owner = owners.find((o) => o.id === id);
      if (!owner) return null;
      change(owner);
      await writeJson(OWNERS_FILE, owners);
      return owner;
    });
  },

  async listBookings({ ownerId, activitySlug, date }) {
    return (await readAll())
      .filter((b) => b.ownerId === ownerId && (!activitySlug || b.activitySlug === activitySlug) && (!date || b.date === date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
  },

  async findBooking(by, value) {
    return (await readAll()).find((b) => b[by] === value);
  },

  insertBooking(booking) {
    return exclusive(async () => {
      const all = await readAll();
      const clash = all.some(
        (b) =>
          b.status !== "cancelled" &&
          b.ownerId === booking.ownerId &&
          b.activitySlug === booking.activitySlug &&
          b.resourceId === booking.resourceId &&
          b.date === booking.date &&
          overlaps(b, booking),
      );
      if (clash) return false;
      await writeAll([...all, booking]);
      return true;
    });
  },

  updateBooking(id, change) {
    return exclusive(async () => {
      const all = await readAll();
      const booking = all.find((b) => b.id === id);
      if (!booking) return null;
      change(booking);
      await writeAll(all);
      return booking;
    });
  },

  readDoc(ownerId, kind, fallback) {
    return readJson(docFile(ownerId, kind), fallback);
  },

  updateDoc(ownerId, kind, fallback, change) {
    return exclusive(async () => {
      const { doc, result } = change(await readJson(docFile(ownerId, kind), fallback));
      await writeJson(docFile(ownerId, kind), doc);
      return result;
    });
  },

  async getLoginFailure(ip) {
    const f = loginFailures.get(ip);
    return f && f.untilMs > Date.now() ? f : null;
  },

  async recordLoginFailure(ip, lockMs) {
    const now = Date.now();
    for (const [key, f] of loginFailures) if (f.untilMs <= now) loginFailures.delete(key);
    const prev = loginFailures.get(ip);
    const next = { count: (prev?.count ?? 0) + 1, untilMs: now + lockMs };
    loginFailures.set(ip, next);
    return next;
  },

  async clearLoginFailures(ip) {
    loginFailures.delete(ip);
  },
};
