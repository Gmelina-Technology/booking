import { randomBytes } from "node:crypto";
import { platform, paymentReady, type Activity, type HostedEvent, type HostedEventKind, type PaymentSettings } from "./facility";
import { bookingFee, type FeeSchedule } from "./fees";
import { closesAt, heldHours, isEventHold, isRegistration, registrationPrice, registrationState, spotsTaken } from "./event-schedule";
import { closedReason } from "./schedule";
import {
  insertBookings,
  insertRegistration,
  listBookings,
  readHostedEvents,
  updateBooking,
  updateHostedEvents,
  type Booking,
} from "./store";
import { addDays, facilityInstant, formatDate, isValidDate } from "./time";

// What staff and players do with hosted events (open play, workshops, tournaments),
// without auth, caching or email: the server actions in app/(staff)/app/events/hosted
// and app/event-actions.ts wrap these. Kept apart so tests can call them directly.
//
// A published event holds its courts with blocked bookings (one per court, tagged
// with the event id), so court bookings can't overlap it. Each registration is a
// booking too, with its own "reg-…" resource so it never clashes on a court.

/** What staff fill in on the event form. */
export type EventInput = Pick<
  HostedEvent,
  | "kind"
  | "title"
  | "activitySlug"
  | "description"
  | "date"
  | "startMinute"
  | "endMinute"
  | "resourceIds"
  | "capacity"
  | "maxSpotsPerRegistration"
  | "teamSize"
  | "price"
  | "payment"
  | "closeHoursBefore"
>;

export type OpResult<T = void> = ({ ok: true } & (T extends void ? unknown : { value: T })) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

const KINDS: HostedEventKind[] = ["open_play", "workshop", "tournament"];

/** Fields that can't change once someone has registered: they'd change what people signed up and paid for. */
const LOCKED: (keyof EventInput)[] = ["kind", "activitySlug", "date", "startMinute", "endMinute", "resourceIds", "price", "teamSize", "payment"];

/** Why the input isn't a valid event, or null. `today` is the facility's date. */
export function validateEvent(input: EventInput, activity: Activity | undefined, settings: PaymentSettings, today: string): string | null {
  const isInt = Number.isInteger;
  if (!KINDS.includes(input.kind)) return "Pick what kind of event it is.";
  if (input.title.trim().length < 3 || input.title.length > 80) return "Give the event a title (3–80 characters).";
  if (input.description.length > 1000) return "Keep the description under 1,000 characters.";
  if (!activity) return "Pick the activity.";
  if (!isValidDate(input.date)) return "Pick the date.";
  if (input.date < today) return "The date has already passed.";
  if (input.date > addDays(today, platform.maxBookingWindowDays)) return `Events can be up to ${platform.maxBookingWindowDays} days ahead.`;
  const { startMinute: start, endMinute: end } = input;
  if (!isInt(start) || !isInt(end) || start % 30 || end % 30) return "Times must be on the hour or half hour.";
  if (end <= start) return "The event must end after it starts.";
  if (start < activity.openHour * 60 || end > activity.closeHour * 60) return `${activity.name} is open ${activity.openHour}:00 to ${activity.closeHour}:00, so the event must fit in those hours.`;
  const courts = new Set(input.resourceIds);
  if (courts.size === 0) return `Pick at least one ${activity.resourceLabel.toLowerCase()}.`;
  if ([...courts].some((id) => !activity.resources.some((r) => r.id === id)) || courts.size !== input.resourceIds.length)
    return `Pick ${activity.resourceLabel.toLowerCase()}s from ${activity.name}.`;
  if (!isInt(input.capacity) || input.capacity < 1 || input.capacity > 500) return "Spots must be between 1 and 500.";
  if (input.kind === "tournament") {
    if (!isInt(input.teamSize) || input.teamSize! < 1 || input.teamSize! > 12) return "Players per team must be between 1 and 12.";
    if (input.maxSpotsPerRegistration !== 1) return "Each tournament registration is one team.";
  } else {
    if (input.teamSize !== undefined) return "Only tournaments have teams.";
    if (!isInt(input.maxSpotsPerRegistration) || input.maxSpotsPerRegistration < 1 || input.maxSpotsPerRegistration > input.capacity)
      return "Spots per registration must be between 1 and the number of spots.";
  }
  if (!isInt(input.price) || input.price < 0 || input.price > 100_000) return "The price must be a whole number of pesos, up to 100,000.";
  if (input.payment !== "online" && input.payment !== "venue") return "Pick how players pay.";
  if (input.payment === "online" && !paymentReady(settings)) return "Add your payment QR code or account number in Payments & alerts first, or let players pay at the venue.";
  if (!isInt(input.closeHoursBefore) || input.closeHoursBefore < 0 || input.closeHoursBefore > 168) return "Registration must close between 0 and 168 hours before the start.";
  return null;
}

/** The blocked bookings that hold the event's courts. */
function holdsFor(ownerId: string, e: HostedEvent) {
  const { startHour, hours } = heldHours(e);
  return e.resourceIds.map((resourceId) => ({
    ownerId,
    activitySlug: e.activitySlug,
    resourceId,
    date: e.date,
    startHour,
    hours,
    name: e.title,
    email: "",
    phone: "",
    players: 0,
    notes: "",
    total: 0,
    blocked: true,
    staffCreated: true,
    eventId: e.id,
    eventTitle: e.title,
    startMinute: e.startMinute,
    endMinute: e.endMinute,
  }));
}

/** Every booking that belongs to the event: its court holds and its registrations. */
export async function eventBookings(ownerId: string, e: Pick<HostedEvent, "id" | "activitySlug" | "date">): Promise<Booking[]> {
  return (await listBookings({ ownerId, activitySlug: e.activitySlug, date: e.date })).filter((b) => b.eventId === e.id);
}

async function releaseHolds(ownerId: string, e: HostedEvent) {
  for (const b of await eventBookings(ownerId, e)) {
    if (!isEventHold(b) || b.status === "cancelled") continue;
    await updateBooking(ownerId, b.id, (x) => {
      x.status = "cancelled";
      x.cancelledAt = new Date().toISOString();
      x.cancelReason = "Event moved or cancelled.";
    });
  }
}

/** Holds the event's courts, or says which bookings are in the way. */
async function hold(ownerId: string, e: HostedEvent, activity: Activity): Promise<string | null> {
  if (await insertBookings(holdsFor(ownerId, e))) return null;
  const { startHour, hours } = heldHours(e);
  const clashes = (await listBookings({ ownerId, activitySlug: e.activitySlug, date: e.date })).filter(
    (b) => b.status !== "cancelled" && e.resourceIds.includes(b.resourceId) && b.startHour < startHour + hours && startHour < b.startHour + b.hours,
  );
  const list = clashes
    .map((b) => `${activity.resources.find((r) => r.id === b.resourceId)?.name ?? b.resourceId} (${b.blocked ? b.name || "blocked" : `booking ${b.id}`})`)
    .join(", ");
  return `Those hours aren't free on ${list || "one of the courts"}. Move or cancel those first, or pick other courts.`;
}

/** Checks the date against closures and the clock, for publishing and moving an event. */
function scheduleProblem(e: HostedEvent, activity: Activity, settings: PaymentSettings, nowMs: number): string | null {
  const closed = closedReason(activity, settings.closures, e.date);
  if (closed) return `${activity.name} is closed on ${formatDate(e.date)} (${closed}).`;
  if (facilityInstant(e.date, e.startMinute) <= nowMs) return "That start time has already passed.";
  return null;
}

/** Creates a draft event. */
export async function createEvent(ownerId: string, input: EventInput, photo: string | null, ctx: { activity?: Activity; settings: PaymentSettings; today: string }): Promise<OpResult<HostedEvent>> {
  const problem = validateEvent(input, ctx.activity, ctx.settings, ctx.today);
  if (problem) return fail(problem);
  const now = new Date().toISOString();
  const event: HostedEvent = { ...clean(input), id: randomBytes(6).toString("hex"), photo, status: "draft", createdAt: now, updatedAt: now };
  await updateHostedEvents(ownerId, (all) => void all.push(event));
  return { ok: true, value: event };
}

/** Only the form's fields, tidied, so nothing else (an id, a status) can come in with them. */
function clean(input: EventInput): EventInput {
  const tournament = input.kind === "tournament";
  return {
    kind: input.kind,
    title: input.title.trim(),
    activitySlug: input.activitySlug,
    description: input.description.trim(),
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    resourceIds: [...input.resourceIds],
    capacity: input.capacity,
    maxSpotsPerRegistration: tournament ? 1 : input.maxSpotsPerRegistration,
    ...(tournament ? { teamSize: input.teamSize } : {}),
    price: input.price,
    payment: input.payment,
    closeHoursBefore: input.closeHoursBefore,
  };
}

class Abort extends Error {}

/** Publishes a draft: checks the schedule, holds its courts and opens registration. */
export async function publishEvent(ownerId: string, id: string, ctx: { activity?: Activity; settings: PaymentSettings; today: string; nowMs?: number }): Promise<OpResult<HostedEvent>> {
  const event = (await readHostedEvents(ownerId)).find((e) => e.id === id);
  if (!event) return fail("That event no longer exists.");
  if (event.status !== "draft") return fail(event.status === "published" ? "It's already published." : "A cancelled event can't be published. Duplicate it instead.");
  const problem = validateEvent(event, ctx.activity, ctx.settings, ctx.today) ?? scheduleProblem(event, ctx.activity!, ctx.settings, ctx.nowMs ?? Date.now());
  if (problem) return fail(problem);
  const blocked = await hold(ownerId, event, ctx.activity!);
  if (blocked) return fail(blocked);

  try {
    const published = await updateHostedEvents(ownerId, (all) => {
      const e = all.find((x) => x.id === id);
      if (!e || e.status !== "draft") throw new Abort();
      e.status = "published";
      e.updatedAt = new Date().toISOString();
      return { ...e };
    });
    return { ok: true, value: published };
  } catch (err) {
    if (!(err instanceof Abort)) throw err;
    // Someone deleted or published it meanwhile: let the courts go again.
    await releaseHolds(ownerId, event);
    return fail("That event changed while publishing. Reload and try again.");
  }
}

/**
 * Saves changes to an event. Drafts can change freely. Once published, the
 * date, time, courts and price stay fixed while anyone is registered, and the
 * spots can't drop below those taken. Moving a published event re-holds its courts.
 */
export async function updateEvent(
  ownerId: string,
  id: string,
  input: EventInput,
  photo: string | null,
  ctx: { activity?: Activity; settings: PaymentSettings; today: string; nowMs?: number },
): Promise<OpResult<HostedEvent>> {
  const before = (await readHostedEvents(ownerId)).find((e) => e.id === id);
  if (!before) return fail("That event no longer exists.");
  if (before.status === "cancelled") return fail("A cancelled event can't be changed.");
  const problem = validateEvent(input, ctx.activity, ctx.settings, ctx.today);
  if (problem) return fail(problem);
  const next: HostedEvent = { ...before, ...clean(input), photo, updatedAt: new Date().toISOString() };
  if (next.kind !== "tournament") delete next.teamSize;

  const bookings = before.status === "published" ? await eventBookings(ownerId, before) : [];
  const taken = spotsTaken(bookings, id);
  const changed = LOCKED.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
  if (taken > 0 && changed.length)
    return fail("People have registered, so the date, time, courts, price and payment can't change. Cancel the event and create a new one instead.");
  if (next.capacity < taken) return fail(`${taken} spots are already taken, so there must be at least ${taken}.`);

  const moved = before.status === "published" && changed.some((k) => k === "activitySlug" || k === "date" || k === "startMinute" || k === "endMinute" || k === "resourceIds");
  if (moved) {
    const schedule = scheduleProblem(next, ctx.activity!, ctx.settings, ctx.nowMs ?? Date.now());
    if (schedule) return fail(schedule);
    await releaseHolds(ownerId, before);
    const blocked = await hold(ownerId, next, ctx.activity!);
    if (blocked) {
      await hold(ownerId, before, ctx.activity!); // Put the old holds back; their hours were free a moment ago.
      return fail(blocked);
    }
  }

  await updateHostedEvents(ownerId, (all) => {
    const i = all.findIndex((x) => x.id === id);
    if (i !== -1) all[i] = next;
  });

  // Keep the copies on the event's bookings in step.
  if (!moved && (before.title !== next.title || before.closeHoursBefore !== next.closeHoursBefore)) {
    const closes = closesAt(next);
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      await updateBooking(ownerId, b.id, (x) => {
        x.eventTitle = next.title;
        if (isEventHold(x)) x.name = next.title;
        if (isRegistration(x)) x.closesAt = closes;
      });
    }
  }
  return { ok: true, value: next };
}

/** Cancels the event and every active registration, and frees its courts. Returns the cancelled registrations, to email. */
export async function cancelEvent(ownerId: string, id: string, reason: string): Promise<OpResult<Booking[]>> {
  const note = reason.trim().slice(0, 300);
  let event: HostedEvent;
  try {
    event = await updateHostedEvents(ownerId, (all) => {
      const e = all.find((x) => x.id === id);
      if (!e || e.status === "cancelled") throw new Abort();
      e.status = "cancelled";
      e.cancelledAt = new Date().toISOString();
      e.cancelReason = note || undefined;
      return { ...e };
    });
  } catch (err) {
    if (err instanceof Abort) return fail("That event is already cancelled or no longer exists.");
    throw err;
  }

  const cancelled: Booking[] = [];
  for (const b of await eventBookings(ownerId, event)) {
    if (b.status === "cancelled") continue;
    const updated = await updateBooking(ownerId, b.id, (x) => {
      if (x.status === "cancelled") return;
      x.status = "cancelled";
      x.cancelledAt = new Date().toISOString();
      x.cancelReason = isRegistration(x) ? note || "The event was cancelled." : "Event cancelled.";
    });
    if (updated && isRegistration(updated)) cancelled.push(updated);
  }
  return { ok: true, value: cancelled };
}

/** Deletes a draft. Published events are cancelled instead, so registrants are told. */
export async function deleteDraft(ownerId: string, id: string): Promise<OpResult<HostedEvent>> {
  try {
    const removed = await updateHostedEvents(ownerId, (all) => {
      const i = all.findIndex((x) => x.id === id);
      if (i === -1 || all[i].status === "published") throw new Abort();
      return all.splice(i, 1)[0];
    });
    return { ok: true, value: removed };
  } catch (err) {
    if (err instanceof Abort) return fail("Only drafts and cancelled events can be deleted. Cancel a published event first.");
    throw err;
  }
}

export type RegistrationInput = {
  name: string;
  email: string;
  phone: string;
  spots: number;
  teamName?: string;
  teamPlayers?: string[];
  notes: string;
};

/**
 * Registers a player (or a captain's team) for a published event. Online
 * payment: awaiting_payment, with the full total due by QR. Paying at the
 * venue: confirmed straight away. The booking fee is added on top, once.
 */
export async function registerForEvent(
  ownerId: string,
  event: HostedEvent,
  input: RegistrationInput,
  ctx: { fees: FeeSchedule; nowMs?: number },
): Promise<OpResult<Booking>> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (name.length < 2) return fail("Please enter your name.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please enter a valid email.");
  if (phone.replace(/\D/g, "").length < 7) return fail("Please enter a valid phone number.");

  const tournament = event.kind === "tournament";
  const spots = tournament ? 1 : Math.round(input.spots);
  if (!(spots >= 1 && spots <= event.maxSpotsPerRegistration)) return fail(`You can take 1–${event.maxSpotsPerRegistration} spots.`);
  const teamName = input.teamName?.trim().slice(0, 60) ?? "";
  const teamPlayers = (input.teamPlayers ?? []).map((p) => p.trim().slice(0, 60));
  if (tournament) {
    if (teamName.length < 2) return fail("Please enter your team name.");
    if (teamPlayers.length !== event.teamSize || teamPlayers.some((p) => p.length < 2)) return fail(`Please name all ${event.teamSize} players.`);
  }

  const nowMs = ctx.nowMs ?? Date.now();
  const existing = await eventBookings(ownerId, event);
  const state = registrationState(event, spotsTaken(existing, event.id), nowMs);
  if (state === "full") return fail("Sorry, this event is full.");
  if (state !== "open") return fail("Registration for this event is closed.");

  const { startHour, hours } = heldHours(event);
  const fee = bookingFee(ctx.fees, ownerId, { date: event.date, hours, status: "pending" }) ?? 0;
  const total = registrationPrice(event, spots) + fee;
  const online = event.payment === "online";
  const approvedAt = new Date(nowMs).toISOString();

  const booking = await insertRegistration(
    {
      ownerId,
      activitySlug: event.activitySlug,
      resourceId: `reg-${randomBytes(6).toString("hex")}`,
      date: event.date,
      startHour,
      hours,
      name,
      email,
      phone,
      players: tournament ? event.teamSize! : spots,
      notes: input.notes.trim().slice(0, 500),
      total,
      bookingFee: fee,
      status: online ? "awaiting_payment" : "confirmed",
      approvedAt,
      downpayment: online ? total : 0,
      eventId: event.id,
      eventTitle: event.title,
      startMinute: event.startMinute,
      endMinute: event.endMinute,
      closesAt: closesAt(event),
      spots,
      ...(tournament ? { teamName, teamPlayers } : {}),
    },
    event.capacity,
  );
  if (booking === "full") return fail("Sorry, the last spots just went.");
  return { ok: true, value: booking };
}
