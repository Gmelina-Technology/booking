import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Uses the JSON file store (no DATABASE_URL) in a temp folder, like store.test.ts.
// after() needs a live request, so its callbacks are collected and run by hand;
// emails go to data/outbox/ since SMTP isn't set. The activity cache is a no-op.
const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterCallbacks.push(fn) }));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const cwd = process.cwd();
let dir: string;
let store: typeof import("@/lib/store");
let holds: typeof import("@/lib/holds");
let notifications: typeof import("@/lib/notifications");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "booking-test-"));
  process.chdir(dir);
  store = await import("@/lib/store");
  holds = await import("@/lib/holds");
  notifications = await import("@/lib/notifications");
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
    profile: { name: handle, tagline: "", address: "", phone: "", email: "" },
  });
  return owner!;
}

async function newBooking(ownerId: string, startHour: number) {
  return (await store.insertBooking({
    ownerId,
    activitySlug: "basketball",
    resourceId: "bb-1",
    date: "2030-01-15",
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

describe("staff notifications", () => {
  it("records new requests and payments, newest first, for that owner only", async () => {
    const owner = await newOwner("notify");
    const other = await newOwner("notify-other");
    const booking = await newBooking(owner.id, 10);

    await notifications.notify("new_request", booking);
    await notifications.notify("payment_submitted", { ...booking, paymentRef: "REF12345" });

    const all = await notifications.listNotifications(owner.id);
    expect(all.map((n) => n.kind)).toEqual(["payment_submitted", "new_request"]);
    expect(all[1]).toMatchObject({ bookingId: booking.id, title: "New booking request from Ana Cruz" });
    expect(all[1].body).toContain("Basketball");
    expect(all[0].body).toContain("Ref REF12345");
    expect(notifications.unreadCount(all)).toBe(2);
    expect(await notifications.listNotifications(other.id)).toEqual([]);
  });

  it("marks one or all as read", async () => {
    const owner = await newOwner("notify-read");
    const booking = await newBooking(owner.id, 10);
    await notifications.notify("new_request", booking);
    await notifications.notify("new_request", booking);
    const [first] = await notifications.listNotifications(owner.id);

    await notifications.markRead(owner.id, [first.id]);
    let all = await notifications.listNotifications(owner.id);
    expect(all.find((n) => n.id === first.id)?.readAt).toBeTruthy();
    expect(notifications.unreadCount(all)).toBe(1);

    await notifications.markRead(owner.id);
    all = await notifications.listNotifications(owner.id);
    expect(notifications.unreadCount(all)).toBe(0);
  });

  it("keeps only the latest MAX_KEPT", async () => {
    const owner = await newOwner("notify-cap");
    const booking = await newBooking(owner.id, 10);
    for (let i = 0; i < notifications.MAX_KEPT + 5; i++) await notifications.notify("new_request", booking);
    expect(await notifications.listNotifications(owner.id)).toHaveLength(notifications.MAX_KEPT);
  });

  it("tells staff when a hold is released automatically", async () => {
    const owner = await newOwner("notify-holds");
    const booking = await newBooking(owner.id, 10);
    await store.updateBooking(owner.id, booking.id, (b) => void (b.createdAt = new Date(Date.now() - 72 * 3600_000).toISOString()));

    afterCallbacks.length = 0;
    await holds.releaseOverdueHolds(owner.id);
    for (const fn of afterCallbacks) await fn();

    const [n] = await notifications.listNotifications(owner.id);
    expect(n).toMatchObject({ kind: "hold_released", bookingId: booking.id });
    expect(n.body).toContain(holds.UNREVIEWED_REASON);
  });
});
