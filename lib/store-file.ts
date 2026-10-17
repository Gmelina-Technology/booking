import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Booking, DocKey, LoginFailure, StoreBackend } from "./store-types";

// JSON files in ./data, for local development with zero setup. Single-process
// only: writes are serialized in memory, which doesn't work across serverless
// instances. Production on Vercel uses lib/store-postgres.ts instead.

const DATA_DIR = path.join(process.cwd(), "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const docFile = (key: DocKey) => path.join(DATA_DIR, `${key}.json`);

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
// each other's edits) at once.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const overlaps = (a: Booking, b: Booking) => a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours;

const loginFailures = new Map<string, LoginFailure>();

export const fileStore: StoreBackend = {
  async listBookings({ activitySlug, date }) {
    return (await readAll())
      .filter((b) => (!activitySlug || b.activitySlug === activitySlug) && (!date || b.date === date))
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

  readDoc(key, fallback) {
    return readJson(docFile(key), fallback);
  },

  updateDoc(key, fallback, change) {
    return exclusive(async () => {
      const { doc, result } = change(await readJson(docFile(key), fallback));
      await writeJson(docFile(key), doc);
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
