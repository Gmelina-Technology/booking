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

describe("releasing unpaid holds", () => {
  it("knows when a hold is overdue", () => {
    const base = { status: "awaiting_payment", approvedAt: new Date(Date.now() - 25 * HOUR).toISOString() } as const;
    expect(holds.isOverdue(base as never, 24)).toBe(true);
    expect(holds.isOverdue(base as never, 48)).toBe(false);
    expect(holds.isOverdue({ ...base, paymentRef: "REF1234" } as never, 24)).toBe(false);
    expect(holds.isOverdue({ ...base, status: "confirmed" } as never, 24)).toBe(false);
  });

  it("frees overdue unpaid slots and leaves the rest", async () => {
    const owner = await newOwner("holds");
    const overdue = (await store.insertBooking(slot(owner.id, 8)))!;
    const paid = (await store.insertBooking(slot(owner.id, 12)))!;
    const fresh = (await store.insertBooking(slot(owner.id, 16)))!;
    await approve(owner.id, overdue.id, 30);
    await approve(owner.id, paid.id, 30, "REF12345");
    await approve(owner.id, fresh.id, 1);

    afterCallbacks.length = 0;
    const released = await holds.releaseOverdueHolds(owner.id);
    expect([...released]).toEqual([overdue.id]);
    expect(afterCallbacks).toHaveLength(1);

    const byId = new Map((await store.listBookings({ ownerId: owner.id })).map((b) => [b.id, b]));
    expect(byId.get(overdue.id)).toMatchObject({ status: "cancelled", cancelReason: holds.EXPIRED_REASON });
    expect(byId.get(paid.id)?.status).toBe("awaiting_payment");
    expect(byId.get(fresh.id)?.status).toBe("awaiting_payment");

    // The freed slot can be booked again, and a second sweep does nothing.
    expect(await store.insertBooking(slot(owner.id, 8))).not.toBeNull();
    expect((await holds.releaseOverdueHolds(owner.id)).size).toBe(0);
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
