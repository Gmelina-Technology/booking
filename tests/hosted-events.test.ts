import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  bookingPlace,
  bookingTime,
  closesAt,
  formatMinuteRange,
  heldHours,
  registrationPrice,
  registrationState,
  spotsTaken,
} from "@/lib/event-schedule";
import { defaultActivities, defaultPaymentSettings, type HostedEvent } from "@/lib/facility";
import { emptySchedule, feeFor, DEFAULT_RATE } from "@/lib/fees";
import type { EventInput } from "@/lib/hosted-event-ops";

// Store-backed parts use the JSON file store in a temp folder, like tests/store.test.ts.
vi.mock("next/server", () => ({ after: () => {} }));

const cwd = process.cwd();
let dir: string;
let store: typeof import("@/lib/store");
let ops: typeof import("@/lib/hosted-event-ops");
let holds: typeof import("@/lib/holds");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "events-test-"));
  process.chdir(dir);
  store = await import("@/lib/store");
  ops = await import("@/lib/hosted-event-ops");
  holds = await import("@/lib/holds");
});

afterAll(async () => {
  process.chdir(cwd);
  await rm(dir, { recursive: true, force: true });
});

const pickleball = defaultActivities.find((a) => a.slug === "pickleball")!;
const settings = { ...defaultPaymentSettings, accountNumber: "0917 000 0000" };
const TODAY = "2030-01-10";
const NOW = Date.parse("2030-01-10T00:00:00Z");
const ctx = { activity: pickleball, settings, today: TODAY, nowMs: NOW };

function input(over: Partial<EventInput> = {}): EventInput {
  return {
    kind: "open_play",
    title: "Tuesday open play",
    activitySlug: "pickleball",
    description: "Rotating doubles, all levels.",
    date: "2030-01-15",
    startMinute: 19 * 60 + 30,
    endMinute: 21 * 60,
    resourceIds: ["pb-1", "pb-2"],
    capacity: 4,
    maxSpotsPerRegistration: 2,
    price: 250,
    payment: "online",
    closeHoursBefore: 2,
    ...over,
  };
}

const player = (name: string, spots = 1) => ({ name, email: `${name.toLowerCase()}@example.test`, phone: "09170000000", spots, notes: "" });

let handles = 0;
async function newOwner() {
  const handle = `club-${++handles}`;
  const { owner } = await store.insertOwner({
    handle,
    email: `${handle}@example.test`,
    passwordHash: "x",
    profile: { name: handle, tagline: "", address: "", phone: "", email: "" },
  });
  return owner!;
}

async function published(ownerId: string, over: Partial<EventInput> = {}) {
  const created = await ops.createEvent(ownerId, input(over), null, ctx);
  if (!created.ok) throw new Error(created.error);
  const result = await ops.publishEvent(ownerId, created.value.id, ctx);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("event times", () => {
  it("holds every whole hour the event touches", () => {
    expect(heldHours({ startMinute: 19 * 60 + 30, endMinute: 21 * 60 })).toEqual({ startHour: 19, hours: 2 });
    expect(heldHours({ startMinute: 18 * 60, endMinute: 19 * 60 + 30 })).toEqual({ startHour: 18, hours: 2 });
    expect(heldHours({ startMinute: 9 * 60, endMinute: 10 * 60 })).toEqual({ startHour: 9, hours: 1 });
  });

  it("formats half hours", () => {
    expect(formatMinuteRange(19 * 60 + 30, 21 * 60)).toBe("7:30 PM – 9:00 PM");
    expect(formatMinuteRange(0, 12 * 60 + 30)).toBe("12:00 AM – 12:30 PM");
  });

  it("shows exact event times and the event title on registrations", () => {
    const b = { startHour: 19, hours: 2, startMinute: 1170, endMinute: 1260, resourceId: "reg-1", eventId: "e1", eventTitle: "Open play" };
    expect(bookingTime(b)).toBe("7:30 PM – 9:00 PM");
    expect(bookingPlace(b, pickleball)).toBe("Open play");
    expect(bookingTime({ startHour: 9, hours: 2 })).toBe("9:00 AM – 11:00 AM");
    expect(bookingPlace({ resourceId: "pb-1" }, pickleball)).toBe("Court 1");
  });

  it("closes registration in the facility's time zone (Manila, UTC+8)", () => {
    // 7:30 PM Manila on Jan 15 is 11:30 UTC; two hours before is 9:30 UTC.
    expect(closesAt({ date: "2030-01-15", startMinute: 19 * 60 + 30, closeHoursBefore: 2 })).toBe("2030-01-15T09:30:00.000Z");
  });
});

describe("registration rules", () => {
  const event = { ...input(), id: "e1", photo: null, status: "published", createdAt: "", updatedAt: "" } as HostedEvent;

  it("is open until full or closed", () => {
    expect(registrationState(event, 0, NOW)).toBe("open");
    expect(registrationState(event, 4, NOW)).toBe("full");
    expect(registrationState(event, 0, Date.parse("2030-01-15T09:30:00Z"))).toBe("closed");
    expect(registrationState({ ...event, status: "draft" }, 0, NOW)).toBe("draft");
    expect(registrationState({ ...event, status: "cancelled" }, 0, NOW)).toBe("cancelled");
  });

  it("prices per player, or once per team", () => {
    expect(registrationPrice({ kind: "open_play", price: 250 }, 3)).toBe(750);
    expect(registrationPrice({ kind: "tournament", price: 1500 }, 1)).toBe(1500);
  });

  it("counts only active registrations, not court holds", () => {
    const rows = [
      { eventId: "e1", status: "confirmed" as const, spots: 2 },
      { eventId: "e1", status: "awaiting_payment" as const },
      { eventId: "e1", status: "cancelled" as const, spots: 3 },
      { eventId: "e1", status: "confirmed" as const, blocked: true },
      { eventId: "e2", status: "confirmed" as const, spots: 5 },
    ];
    expect(spotsTaken(rows, "e1")).toBe(3);
  });

  it("validates the event form", () => {
    const check = (over: Partial<EventInput>) => ops.validateEvent(input(over), pickleball, settings, TODAY);
    expect(check({})).toBeNull();
    expect(check({ startMinute: 19 * 60 + 15 })).toMatch(/half hour/);
    expect(check({ endMinute: 19 * 60 })).toMatch(/end after/);
    expect(check({ startMinute: 5 * 60 })).toMatch(/open 6:00 to 22:00/);
    expect(check({ resourceIds: [] })).toMatch(/at least one/);
    expect(check({ resourceIds: ["bd-1"] })).toMatch(/from Pickleball/);
    expect(check({ date: "2030-01-09" })).toMatch(/passed/);
    expect(check({ maxSpotsPerRegistration: 5 })).toMatch(/Spots per registration/);
    expect(check({ kind: "tournament", maxSpotsPerRegistration: 1 })).toMatch(/Players per team/);
    expect(check({ kind: "tournament", maxSpotsPerRegistration: 1, teamSize: 2 })).toBeNull();
    expect(ops.validateEvent(input(), pickleball, defaultPaymentSettings, TODAY)).toMatch(/payment QR/);
    expect(ops.validateEvent(input({ payment: "venue" }), pickleball, defaultPaymentSettings, TODAY)).toBeNull();
  });
});

describe("publishing", () => {
  it("drafts hold nothing; publishing holds each court for the whole hours", async () => {
    const owner = await newOwner();
    const draft = await ops.createEvent(owner.id, input(), null, ctx);
    expect(draft.ok).toBe(true);
    expect(await store.listBookings({ ownerId: owner.id })).toHaveLength(0);

    const event = await ops.publishEvent(owner.id, draft.ok ? draft.value.id : "", ctx);
    expect(event.ok && event.value.status).toBe("published");
    const held = await store.listBookings({ ownerId: owner.id });
    expect(held.map((b) => [b.resourceId, b.startHour, b.hours, b.blocked, b.status])).toEqual([
      ["pb-1", 19, 2, true, "confirmed"],
      ["pb-2", 19, 2, true, "confirmed"],
    ]);

    // A court booking on a held hour is refused.
    const clash = await store.insertBooking({ ...held[0], eventId: undefined, blocked: undefined, startHour: 20, hours: 1, name: "Walk-in" });
    expect(clash).toBeNull();
  });

  it("refuses to publish over a booking and writes nothing", async () => {
    const owner = await newOwner();
    await store.insertBooking({
      ownerId: owner.id,
      activitySlug: "pickleball",
      resourceId: "pb-2",
      date: "2030-01-15",
      startHour: 20,
      hours: 1,
      name: "Customer",
      email: "c@example.test",
      phone: "09170000000",
      players: 2,
      notes: "",
      total: 400,
    });
    const draft = await ops.createEvent(owner.id, input(), null, ctx);
    const result = await ops.publishEvent(owner.id, draft.ok ? draft.value.id : "", ctx);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Court 2/);
    expect((await store.listBookings({ ownerId: owner.id })).filter((b) => b.eventId)).toHaveLength(0);
    expect((await store.readHostedEvents(owner.id))[0].status).toBe("draft");
  });

  it("refuses closed days", async () => {
    const owner = await newOwner();
    const closed = { ...settings, closures: [{ id: "c1", date: "2030-01-15", activitySlug: "", note: "Holiday" }] };
    const draft = await ops.createEvent(owner.id, input(), null, ctx);
    const result = await ops.publishEvent(owner.id, draft.ok ? draft.value.id : "", { ...ctx, settings: closed });
    expect(!result.ok && result.error).toMatch(/Holiday/);
  });

  it("moves the court holds when an event without registrations changes time", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    const moved = await ops.updateEvent(owner.id, event.id, input({ startMinute: 20 * 60, endMinute: 22 * 60, resourceIds: ["pb-3"] }), null, ctx);
    expect(moved.ok).toBe(true);
    const active = (await store.listBookings({ ownerId: owner.id })).filter((b) => b.status !== "cancelled");
    expect(active.map((b) => [b.resourceId, b.startHour, b.hours])).toEqual([["pb-3", 20, 2]]);
  });
});

describe("registering", () => {
  it("online payment waits for payment, with the full total and the fee on top", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    const result = await ops.registerForEvent(owner.id, event, player("Ana", 2), { fees: emptySchedule(), nowMs: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fee = feeFor(DEFAULT_RATE, 2);
    expect(result.value).toMatchObject({ status: "awaiting_payment", spots: 2, total: 500 + fee, bookingFee: fee, downpayment: 500 + fee, eventTitle: "Tuesday open play" });
    expect(result.value.resourceId).toMatch(/^reg-/);
  });

  it("pay-at-venue registrations are confirmed straight away", async () => {
    const owner = await newOwner();
    const event = await published(owner.id, { payment: "venue" });
    const result = await ops.registerForEvent(owner.id, event, player("Ben"), { fees: emptySchedule(), nowMs: NOW });
    expect(result.ok && result.value.status).toBe("confirmed");
  });

  it("tournaments take one team with every player named", async () => {
    const owner = await newOwner();
    const event = await published(owner.id, { kind: "tournament", maxSpotsPerRegistration: 1, teamSize: 2, capacity: 8, price: 1500 });
    const missing = await ops.registerForEvent(owner.id, event, { ...player("Cap"), teamName: "Smash Bros", teamPlayers: ["Cap"] }, { fees: emptySchedule(), nowMs: NOW });
    expect(!missing.ok && missing.error).toMatch(/all 2 players/);
    const team = await ops.registerForEvent(owner.id, event, { ...player("Cap"), teamName: "Smash Bros", teamPlayers: ["Cap", "Dee"] }, { fees: emptySchedule(), nowMs: NOW });
    expect(team.ok && team.value).toMatchObject({ spots: 1, players: 2, teamName: "Smash Bros", total: 1500 + feeFor(DEFAULT_RATE, 2) });
  });

  it("never sells more spots than the event has, even when people register at once", async () => {
    const owner = await newOwner();
    const event = await published(owner.id); // 4 spots
    const results = await Promise.all(
      ["A1", "B2", "C3", "D4", "E5", "F6"].map((n) => ops.registerForEvent(owner.id, event, player(n), { fees: emptySchedule(), nowMs: NOW })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(spotsTaken(await store.listBookings({ ownerId: owner.id }), event.id)).toBe(4);
    const late = await ops.registerForEvent(owner.id, event, player("Late"), { fees: emptySchedule(), nowMs: NOW });
    expect(!late.ok && late.error).toMatch(/full/);
  });

  it("refuses more spots than allowed per registration, and after registration closes", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    const many = await ops.registerForEvent(owner.id, event, player("Greedy", 3), { fees: emptySchedule(), nowMs: NOW });
    expect(!many.ok && many.error).toMatch(/1–2 spots/);
    const late = await ops.registerForEvent(owner.id, event, player("Late"), { fees: emptySchedule(), nowMs: Date.parse("2030-01-15T10:00:00Z") });
    expect(!late.ok && late.error).toMatch(/closed/);
  });

  it("registrations don't block courts", async () => {
    const owner = await newOwner();
    const event = await published(owner.id, { resourceIds: ["pb-1"] });
    await ops.registerForEvent(owner.id, event, player("Ana"), { fees: emptySchedule(), nowMs: NOW });
    // Court 4 is still free at the same time.
    const free = await store.insertBooking({ ...player("Walk"), ownerId: owner.id, activitySlug: "pickleball", resourceId: "pb-4", date: "2030-01-15", startHour: 19, hours: 2, players: 2, total: 800 });
    expect(free).not.toBeNull();
  });
});

describe("unpaid registrations", () => {
  it("are released when registration closes, even inside the payment window", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    const result = await ops.registerForEvent(owner.id, event, player("Ana"), { fees: emptySchedule(), nowMs: NOW });
    if (!result.ok) throw new Error(result.error);
    const b = result.value;
    const closing = Date.parse(b.closesAt!);
    // Registered an hour before it closes: the 24-hour payment window hasn't passed, but registration has closed.
    const recent = { ...b, approvedAt: new Date(closing - 3600_000).toISOString() };
    expect(holds.expiryReason(recent, settings, closing - 1)).toBeNull();
    expect(holds.expiryReason(recent, settings, closing)).toBe(holds.CLOSED_REASON);
    expect(holds.expiryReason({ ...recent, paymentRef: "REF123" }, settings, closing + 1)).toBeNull();
  });
});

describe("editing and cancelling", () => {
  it("locks the schedule and price once anyone registers, and keeps capacity above spots taken", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    await ops.registerForEvent(owner.id, event, player("Ana", 2), { fees: emptySchedule(), nowMs: NOW });
    const moved = await ops.updateEvent(owner.id, event.id, input({ startMinute: 20 * 60, endMinute: 22 * 60 }), null, ctx);
    expect(!moved.ok && moved.error).toMatch(/can't change/);
    const repriced = await ops.updateEvent(owner.id, event.id, input({ price: 300 }), null, ctx);
    expect(repriced.ok).toBe(false);
    const shrunk = await ops.updateEvent(owner.id, event.id, input({ capacity: 1, maxSpotsPerRegistration: 1 }), null, ctx);
    expect(!shrunk.ok && shrunk.error).toMatch(/at least 2/);
    const renamed = await ops.updateEvent(owner.id, event.id, input({ title: "Late-night open play", capacity: 8 }), null, ctx);
    expect(renamed.ok).toBe(true);
    const rows = (await store.listBookings({ ownerId: owner.id })).filter((b) => b.eventId === event.id);
    expect(rows.every((b) => b.eventTitle === "Late-night open play")).toBe(true);
  });

  it("cancelling cancels every registration and frees the courts", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    await ops.registerForEvent(owner.id, event, player("Ana"), { fees: emptySchedule(), nowMs: NOW });
    await ops.registerForEvent(owner.id, event, player("Ben"), { fees: emptySchedule(), nowMs: NOW });
    const result = await ops.cancelEvent(owner.id, event.id, "Rain");
    expect(result.ok && result.value.map((b) => b.name).sort()).toEqual(["Ana", "Ben"]);
    const rows = await store.listBookings({ ownerId: owner.id });
    expect(rows.every((b) => b.status === "cancelled")).toBe(true);
    expect(rows.filter((b) => !b.blocked).every((b) => b.cancelReason === "Rain")).toBe(true);
    expect((await store.readHostedEvents(owner.id))[0].status).toBe("cancelled");
    // The court is free again.
    const free = await store.insertBooking({ ...player("Walk"), ownerId: owner.id, activitySlug: "pickleball", resourceId: "pb-1", date: "2030-01-15", startHour: 19, hours: 2, players: 2, total: 800 });
    expect(free).not.toBeNull();
  });

  it("only deletes drafts and cancelled events", async () => {
    const owner = await newOwner();
    const event = await published(owner.id);
    expect((await ops.deleteDraft(owner.id, event.id)).ok).toBe(false);
    await ops.cancelEvent(owner.id, event.id, "");
    expect((await ops.deleteDraft(owner.id, event.id)).ok).toBe(true);
    expect(await store.readHostedEvents(owner.id)).toHaveLength(0);
  });
});
