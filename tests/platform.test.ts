import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/lib/store";

// Platform admin features: bookings across partners, partner stats, new-partner
// notifications and suspension. Uses the JSON file store (no DATABASE_URL) in a
// temp folder, like store.test.ts; emails go to data/outbox/ since SMTP isn't set.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const cwd = process.cwd();
let dir: string;
let store: typeof import("@/lib/store");
let stats: typeof import("@/lib/platform-stats");
let platformNotifications: typeof import("@/lib/platform-notifications");
let owners: typeof import("@/lib/owners");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "booking-test-"));
  process.chdir(dir);
  store = await import("@/lib/store");
  stats = await import("@/lib/platform-stats");
  platformNotifications = await import("@/lib/platform-notifications");
  owners = await import("@/lib/owners");
});

afterAll(async () => {
  process.chdir(cwd);
  await rm(dir, { recursive: true, force: true });
});

async function newOwner(handle: string) {
  const { owner } = await store.insertOwner({
    handle,
    email: `${handle}@example.test`,
    passwordHash: "x",
    profile: { name: `${handle} courts`, tagline: "", address: "", phone: "", email: "" },
  });
  return owner!;
}

async function newBooking(ownerId: string, date: string, startHour = 10) {
  return (await store.insertBooking({
    ownerId,
    activitySlug: "basketball",
    resourceId: "bb-1",
    date,
    startHour,
    hours: 2,
    name: "Ana Cruz",
    email: "customer@example.test",
    phone: "09170000000",
    players: 4,
    notes: "",
    total: 2000,
  }))!;
}

describe("bookings across partners", () => {
  it("lists every partner's bookings, filtered by partner, dates and status", async () => {
    const a = await newOwner("across-a");
    const b = await newOwner("across-b");
    const a1 = await newBooking(a.id, "2031-03-01");
    const a2 = await newBooking(a.id, "2031-03-20");
    const b1 = await newBooking(b.id, "2031-03-10");
    await store.updateBooking(b.id, b1.id, (x) => void (x.status = "confirmed"));

    const ids = (list: Booking[]) => list.map((x) => x.id);
    const march = await store.listPlatformBookings({ from: "2031-03-01", to: "2031-03-31" });
    expect(ids(march)).toEqual([a1.id, b1.id, a2.id]);
    expect(ids(await store.listPlatformBookings({ ownerId: a.id, from: "2031-03-01" }))).toEqual([a1.id, a2.id]);
    expect(ids(await store.listPlatformBookings({ from: "2031-03-05", to: "2031-03-15" }))).toEqual([b1.id]);
    expect(ids(await store.listPlatformBookings({ from: "2031-03-01", status: "confirmed" }))).toEqual([b1.id]);
  });

  it("pages in the store, counting every match and clamping a page past the end", async () => {
    const a = await newOwner("paged-a");
    const b = await newOwner("paged-b");
    const made: Booking[] = [];
    for (let day = 1; day <= 7; day++) made.push(await newBooking(day % 2 ? a.id : b.id, `2032-01-0${day}`));
    const ids = (list: Booking[]) => list.map((x) => x.id);
    const all = ids(made);
    const january = { from: "2032-01-01", to: "2032-01-31" };

    expect(ids(await store.listPlatformBookings({ ...january, limit: 3, offset: 3 }))).toEqual(all.slice(3, 6));
    expect(await store.listPlatformBookings({ ...january, limit: 3, offset: 9 })).toEqual([]);

    const first = await store.pagePlatformBookings(january, 1, 3);
    expect(first).toMatchObject({ page: 1, pages: 3, from: 1, to: 3, total: 7 });
    expect(ids(first.rows)).toEqual(all.slice(0, 3));
    const last = await store.pagePlatformBookings(january, 9, 3);
    expect(last).toMatchObject({ page: 3, from: 7, to: 7, total: 7 });
    expect(ids(last.rows)).toEqual(all.slice(6));

    const newest = await store.pagePlatformBookings({ ...january, newestFirst: true }, 1, 3);
    expect(ids(newest.rows)).toEqual(all.slice(4).reverse());
    const partner = await store.pagePlatformBookings({ ...january, ownerId: b.id }, 1, 2);
    expect(partner).toMatchObject({ pages: 2, total: 3 });

    const empty = await store.pagePlatformBookings({ from: "2032-02-01", to: "2032-02-28" }, 2);
    expect(empty).toMatchObject({ rows: [], page: 1, pages: 1, total: 0 });
  });

  it("filters waiting bookings and searches reference, customer, email and phone", async () => {
    const a = await newOwner("search-a");
    const request = await newBooking(a.id, "2032-03-01");
    const paid = await newBooking(a.id, "2032-03-02");
    const unpaid = await newBooking(a.id, "2032-03-03");
    const walkIn = await newBooking(a.id, "2032-03-04");
    await store.updateBooking(a.id, paid.id, (x) => Object.assign(x, { status: "awaiting_payment", paymentRef: "GC123", email: "Bea@Example.test" }));
    await store.updateBooking(a.id, unpaid.id, (x) => Object.assign(x, { status: "awaiting_payment", phone: "09998887777" }));
    await store.updateBooking(a.id, walkIn.id, (x) => Object.assign(x, { staffCreated: true, name: "Walk In" }));
    const march = { from: "2032-03-01", to: "2032-03-31" };
    const ids = (list: Booking[]) => list.map((x) => x.id);

    expect(ids(await store.listPlatformBookings({ ...march, waiting: true }))).toEqual([request.id, paid.id]);
    expect((await store.pagePlatformBookings({ ...march, waiting: true }, 1)).total).toBe(2);
    expect(ids(await store.listPlatformBookings({ ...march, search: "bea@example" }))).toEqual([paid.id]);
    expect(ids(await store.listPlatformBookings({ ...march, search: "  walk in " }))).toEqual([walkIn.id]);
    expect(ids(await store.listPlatformBookings({ ...march, search: "8887" }))).toEqual([unpaid.id]);
    expect(ids(await store.listPlatformBookings({ ...march, search: request.id.toLowerCase() }))).toEqual([request.id]);
    expect((await store.pagePlatformBookings({ ...march, search: "nobody" }, 1)).total).toBe(0);
  });

  it("sums each partner's numbers in the store, the same as partnerStats()", async () => {
    const a = await newOwner("summary-a");
    const b = await newOwner("summary-b");
    const a1 = await newBooking(a.id, "2033-01-05");
    const a2 = await newBooking(a.id, "2033-01-06");
    await newBooking(a.id, "2033-01-07");
    const b1 = await newBooking(b.id, "2033-01-05");
    await store.updateBooking(a.id, a1.id, (x) => Object.assign(x, { status: "confirmed", total: 1500 }));
    await store.updateBooking(a.id, a2.id, (x) => Object.assign(x, { status: "cancelled" }));
    await store.updateBooking(b.id, b1.id, (x) => Object.assign(x, { status: "confirmed", noShowAt: "2033-01-05T12:00:00Z", downpayment: 300 }));
    const filter = { from: "2033-01-01", to: "2033-01-31" };
    const today = "2033-01-06";
    const now = Date.parse("2033-01-06T00:00:00Z");

    const summary = await store.summarizePlatformBookings(filter, today, now);
    const bookings = await store.listPlatformBookings(filter);
    for (const owner of [a, b]) {
      const mine = bookings.filter((x) => x.ownerId === owner.id);
      expect(summary.find((s) => s.ownerId === owner.id)).toEqual({
        ownerId: owner.id,
        ...stats.partnerStats(mine, today, now),
        cancelled: mine.filter((x) => x.status === "cancelled").length,
      });
    }
    expect(summary.find((s) => s.ownerId === a.id)).toMatchObject({ total: 3, cancelled: 1, confirmedValue: 1500, upcoming: 1 });
    expect(summary.find((s) => s.ownerId === b.id)).toMatchObject({ total: 1, confirmedValue: 300 });
    expect(await store.summarizePlatformBookings({ ...filter, ownerId: b.id }, today, now)).toHaveLength(1);
  });

  it("reads every partner's settings and activities at once, with defaults for the rest", async () => {
    const a = await newOwner("bulk-a");
    const b = await newOwner("bulk-b");
    await store.writeSettings(a.id, { ...(await store.readSettings(a.id)), accountName: "Bulk A" });

    const settings = await store.readAllSettings([a.id, b.id]);
    expect(settings.get(a.id)).toEqual(await store.readSettings(a.id));
    expect(settings.get(b.id)).toEqual(await store.readSettings(b.id));
    expect(settings.get(a.id)?.accountName).toBe("Bulk A");
    const activities = await store.readAllActivities([a.id, b.id]);
    expect(activities.get(b.id)).toEqual(await store.readActivities(b.id));
  });
});

describe("partner stats", () => {
  const now = Date.parse("2031-05-10T12:00:00Z");
  const base = { ownerId: "x", activitySlug: "a", resourceId: "r", startHour: 9, hours: 1, name: "", email: "", phone: "", players: 1, notes: "", total: 500 };
  const booking = (over: Partial<Booking>): Booking => ({ id: Math.random().toString(36), date: "2031-05-12", status: "pending", createdAt: "2031-05-10T10:00:00Z", ...base, ...over });

  it("flags requests and payment references waiting on the partner too long", () => {
    const fresh = booking({});
    const old = booking({ createdAt: "2031-05-08T10:00:00Z" });
    const walkIn = booking({ createdAt: "2031-05-01T10:00:00Z", staffCreated: true });
    const unchecked = booking({ status: "awaiting_payment", paymentRef: "REF1", paymentSubmittedAt: "2031-05-09T06:00:00Z" });
    const unpaid = booking({ status: "awaiting_payment", createdAt: "2031-05-01T10:00:00Z" });

    expect([fresh, old, walkIn, unchecked, unpaid].map((b) => stats.isStale(b, now))).toEqual([false, true, false, true, false]);
    expect(stats.hoursWaiting(old, now)).toBe(50);
    expect(stats.hoursWaiting(unpaid, now)).toBeNull();
  });

  it("sums a partner's bookings", () => {
    const s = stats.partnerStats(
      [
        booking({ status: "confirmed", total: 1500, createdAt: "2031-05-09T00:00:00Z" }),
        booking({ status: "cancelled", date: "2031-05-20" }),
        booking({ date: "2031-04-01", createdAt: "2031-03-01T00:00:00Z", status: "confirmed", total: 800 }),
        booking({ createdAt: "2031-05-07T00:00:00Z" }),
      ],
      "2031-05-10",
      now,
    );
    expect(s).toEqual({ total: 4, upcoming: 2, recent: 3, waiting: 1, stale: 1, confirmedValue: 2300, lastBookingAt: "2031-05-10T10:00:00Z" });
  });
});

describe("new partner notifications", () => {
  it("adds one shared notification and emails every other admin", async () => {
    const owner = await newOwner("joined");
    await platformNotifications.notifyPartnerJoined(owner, ["boss@example.test", owner.email], "https://example.test");

    const [n] = await platformNotifications.listPlatformNotifications();
    expect(n).toMatchObject({ kind: "partner_joined", ownerId: owner.id, title: "New partner: joined courts", readBy: [] });

    const outbox = await readdir(path.join(dir, "data", "outbox"));
    const sent = outbox.filter((f) => f.includes("joined") || f.includes("boss"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("boss@example.test");
    expect(await readFile(path.join(dir, "data", "outbox", sent[0]), "utf8")).toContain(`https://example.test/admin/partners/${owner.id}`);
  });

  it("keeps read state per admin", async () => {
    const owner = await newOwner("joined-read");
    await platformNotifications.notifyPartnerJoined(owner, [], "https://example.test");
    const [n] = await platformNotifications.listPlatformNotifications();

    await platformNotifications.markPlatformRead("admin-1", [n.id]);
    const [after] = await platformNotifications.listPlatformNotifications();
    expect(platformNotifications.isReadBy(after, "admin-1")).toBe(true);
    expect(platformNotifications.isReadBy(after, "admin-2")).toBe(false);

    await platformNotifications.markPlatformRead("admin-2");
    expect((await platformNotifications.listPlatformNotifications()).every((x) => platformNotifications.isReadBy(x, "admin-2"))).toBe(true);
  });
});

describe("suspended partners", () => {
  it("leave the directory but keep their booking links working", async () => {
    const owner = await newOwner("suspend-me");
    expect(await owners.getPublicOwner("suspend-me")).toBeDefined();

    await store.updateOwner(owner.id, (o) => void (o.suspension = { at: new Date().toISOString(), by: "boss@example.test", reason: "Testing" }));
    expect(await owners.getPublicOwner("suspend-me")).toBeUndefined();
    expect((await owners.getPublicOwners()).some((o) => o.id === owner.id)).toBe(false);
    expect(await owners.getPublicOwnerById(owner.id)).toMatchObject({ handle: "suspend-me", suspended: true });

    await store.updateOwner(owner.id, (o) => void delete o.suspension);
    expect(await owners.getPublicOwner("suspend-me")).toMatchObject({ handle: "suspend-me" });
  });
});

describe("paused pages", () => {
  it("stay online with the partner's message but leave the directory", async () => {
    const owner = await newOwner("pause-me");
    expect((await owners.getListedOwners()).some((o) => o.id === owner.id)).toBe(true);

    await store.updateOwner(owner.id, (o) => void (o.pause = { at: new Date().toISOString(), message: "Resurfacing", until: "2026-11-10" }));
    expect(await owners.getPublicOwner("pause-me")).toMatchObject({ pause: { message: "Resurfacing", until: "2026-11-10" } });
    expect(await owners.getPublicOwnerById(owner.id)).toMatchObject({ pause: { message: "Resurfacing" } });
    expect((await owners.getListedOwners()).some((o) => o.id === owner.id)).toBe(false);

    await store.updateOwner(owner.id, (o) => void delete o.pause);
    expect((await owners.getPublicOwner("pause-me"))?.pause).toBeUndefined();
    expect((await owners.getListedOwners()).some((o) => o.id === owner.id)).toBe(true);
  });

  it("end by themselves on their reopening date", () => {
    expect(owners.isPaused(undefined, "2026-11-09")).toBe(false);
    expect(owners.isPaused({}, "2030-01-01")).toBe(true);
    expect(owners.isPaused({ until: "2026-11-10" }, "2026-11-09")).toBe(true);
    expect(owners.isPaused({ until: "2026-11-10" }, "2026-11-10")).toBe(false);
  });
});
