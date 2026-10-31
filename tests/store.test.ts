import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Uses the JSON file store (no DATABASE_URL) in a temp folder, since it writes to ./data.
// after() needs a live request, so emails queued by releaseOverdueHolds are just collected.
const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterCallbacks.push(fn) }));

const cwd = process.cwd();
let dir: string;
let store: typeof import("@/lib/store");
let holds: typeof import("@/lib/holds");
let rateLimit: typeof import("@/lib/rate-limit");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "booking-test-"));
  process.chdir(dir);
  store = await import("@/lib/store");
  holds = await import("@/lib/holds");
  rateLimit = await import("@/lib/rate-limit");
});

afterAll(async () => {
  process.chdir(cwd);
  await rm(dir, { recursive: true, force: true });
});

const HOUR = 3600_000;

async function newOwner(handle: string) {
  const { owner } = await store.insertOwner({
    handle,
    email: `${handle}@example.test`,
    passwordHash: "x",
    profile: { name: handle, tagline: "", address: "", phone: "", email: "" },
  });
  return owner!;
}

function slot(ownerId: string, startHour: number) {
  return {
    ownerId,
    activitySlug: "basketball",
    resourceId: "bb-1",
    date: "2030-01-15",
    startHour,
    hours: 2,
    name: "Customer",
    email: "customer@example.test",
    phone: "09170000000",
    players: 4,
    notes: "",
    total: 2000,
  };
}

/** Marks a booking approved `hoursAgo` hours ago and still unpaid. */
async function approve(ownerId: string, id: string, hoursAgo: number, paymentRef?: string) {
  await store.updateBooking(ownerId, id, (b) => {
    b.status = "awaiting_payment";
    b.approvedAt = new Date(Date.now() - hoursAgo * HOUR).toISOString();
    b.paymentRef = paymentRef;
  });
}

describe("bookings", () => {
  it("never double-books a court", async () => {
    const owner = await newOwner("overlap");
    expect(await store.insertBooking(slot(owner.id, 10))).not.toBeNull();
    expect(await store.insertBooking(slot(owner.id, 11))).toBeNull();
    expect(await store.insertBooking(slot(owner.id, 12))).not.toBeNull();
  });

  it("keeps each business's bookings to itself", async () => {
    const a = await newOwner("owner-a");
    const b = await newOwner("owner-b");
    const booking = (await store.insertBooking(slot(a.id, 10)))!;
    expect(await store.insertBooking(slot(b.id, 10))).not.toBeNull();
    expect(await store.updateBooking(b.id, booking.id, (x) => void (x.status = "cancelled"))).toBeNull();
  });
});

describe("releasing expired holds", () => {
  const windows = { paymentWindowHours: 24, requestWindowHours: 48 };
  const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
  const future = { date: "2030-01-15", startHour: 10 };

  it("knows when an unpaid hold has expired", () => {
    const base = { ...future, status: "awaiting_payment", createdAt: ago(30), approvedAt: ago(25) } as const;
    expect(holds.expiryReason(base as never, windows)).toBe(holds.UNPAID_REASON);
    expect(holds.expiryReason(base as never, { ...windows, paymentWindowHours: 48 })).toBeNull();
    expect(holds.expiryReason({ ...base, paymentRef: "REF1234" } as never, windows)).toBeNull();
    expect(holds.expiryReason({ ...base, status: "confirmed" } as never, windows)).toBeNull();
  });

  it("knows when an unreviewed request has expired", () => {
    const base = { ...future, status: "pending", createdAt: ago(50) } as const;
    expect(holds.expiryReason(base as never, windows)).toBe(holds.UNREVIEWED_REASON);
    expect(holds.expiryReason({ ...base, createdAt: ago(1) } as never, windows)).toBeNull();
    // Its start time has passed, however recent the request.
    expect(holds.expiryReason({ ...base, createdAt: ago(1), date: "2020-01-01" } as never, windows)).toBe(holds.UNREVIEWED_REASON);
    // Staff entered it themselves.
    expect(holds.expiryReason({ ...base, staffCreated: true } as never, windows)).toBeNull();
  });

  it("frees expired slots and leaves the rest", async () => {
    const owner = await newOwner("holds");
    const overdue = (await store.insertBooking(slot(owner.id, 6)))!;
    const paid = (await store.insertBooking(slot(owner.id, 8)))!;
    const fresh = (await store.insertBooking(slot(owner.id, 10)))!;
    const staleRequest = (await store.insertBooking(slot(owner.id, 12)))!;
    const newRequest = (await store.insertBooking(slot(owner.id, 14)))!;
    const phoneBooking = (await store.insertBooking({ ...slot(owner.id, 16), staffCreated: true }))!;
    await approve(owner.id, overdue.id, 30);
    await approve(owner.id, paid.id, 30, "REF12345");
    await approve(owner.id, fresh.id, 1);
    for (const id of [staleRequest.id, phoneBooking.id]) await store.updateBooking(owner.id, id, (b) => void (b.createdAt = ago(72)));

    afterCallbacks.length = 0;
    const released = await holds.releaseOverdueHolds(owner.id);
    expect([...released].sort()).toEqual([overdue.id, staleRequest.id].sort());
    expect(afterCallbacks).toHaveLength(1);

    const byId = new Map((await store.listBookings({ ownerId: owner.id })).map((b) => [b.id, b]));
    expect(byId.get(overdue.id)).toMatchObject({ status: "cancelled", cancelReason: holds.UNPAID_REASON });
    expect(byId.get(staleRequest.id)).toMatchObject({ status: "cancelled", cancelReason: holds.UNREVIEWED_REASON });
    expect(byId.get(paid.id)?.status).toBe("awaiting_payment");
    expect(byId.get(fresh.id)?.status).toBe("awaiting_payment");
    expect(byId.get(newRequest.id)?.status).toBe("pending");
    expect(byId.get(phoneBooking.id)?.status).toBe("pending");

    // The freed slot can be booked again, and a second sweep does nothing.
    expect(await store.insertBooking(slot(owner.id, 6))).not.toBeNull();
    expect((await holds.releaseOverdueHolds(owner.id)).size).toBe(0);
  });
});

describe("deleting an account", () => {
  it("removes the owner, their bookings and documents, and nobody else's", async () => {
    const gone = await newOwner("leaving");
    const stays = await newOwner("staying");
    await store.insertBooking(slot(gone.id, 10));
    const kept = (await store.insertBooking(slot(stays.id, 10)))!;
    await store.writeSettings(gone.id, { ...(await store.readSettings(gone.id)), accountName: "Leaving Co" });

    await store.deleteOwner(gone.id);

    expect(await store.getOwnerById(gone.id)).toBeUndefined();
    expect(await store.listBookings({ ownerId: gone.id })).toEqual([]);
    expect((await store.readSettings(gone.id)).accountName).toBe("");
    expect((await store.listBookings({ ownerId: stays.id })).map((b) => b.id)).toEqual([kept.id]);
    // The handle and email are free again.
    expect((await store.insertOwner({ handle: "leaving", email: "leaving@example.test", passwordHash: "x", profile: gone.profile })).result).toBe("ok");
  });
});

describe("rate limits", () => {
  it("allows up to the limit, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit.overLimit("test:1.2.3.4", 3, HOUR));
    expect(results).toEqual([false, false, false, true]);
    expect(await rateLimit.overLimit("test:5.6.7.8", 3, HOUR)).toBe(false);
  });
});

describe("view-as log", () => {
  it("keeps entries newest first", async () => {
    const entry = (event: "start" | "stop") => ({ at: new Date().toISOString(), event, adminEmail: "admin@example.test", ownerId: "abc", ownerHandle: "acme" });
    await store.logViewAs(entry("start"));
    await store.logViewAs(entry("stop"));
    expect((await store.readViewAsLog()).map((e) => e.event)).toEqual(["stop", "start"]);
  });
});
