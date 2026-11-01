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
