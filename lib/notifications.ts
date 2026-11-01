import { randomBytes } from "node:crypto";
import { getActivity } from "./activities";
import { formatHourRange } from "./facility";
import { readNotifications, updateNotifications, type Booking } from "./store";
import type { AppNotification, NotificationKind } from "./store-types";
import { formatDate } from "./time";

// In-app notifications for staff: the bell in the staff header (app/notifications.tsx).
// Each owner keeps their most recent MAX_KEPT in one document; older ones drop off.
// Raised when a customer requests a booking or enters a payment reference, and
// when a hold is released automatically (lib/holds.ts).

export type { AppNotification, NotificationKind } from "./store-types";

export const MAX_KEPT = 50;

const titles: Record<NotificationKind, (b: Booking) => string> = {
  new_request: (b) => `New booking request from ${b.name}`,
  payment_submitted: (b) => `${b.name} says they've paid`,
  hold_released: (b) => `Booking ${b.id} was released`,
};

/** "Basketball · Court 1 · Wed, Jan 15 · 9:00 AM – 11:00 AM", plus the payment reference when there is one. */
async function describe(kind: NotificationKind, b: Booking) {
  const activity = await getActivity(b.ownerId, b.activitySlug);
  const court = activity?.resources.find((r) => r.id === b.resourceId)?.name ?? b.resourceId;
  const when = `${formatDate(b.date, { weekday: "short", month: "short" })} · ${formatHourRange(b.startHour, b.hours)}`;
  const slot = `${activity?.name ?? b.activitySlug} · ${court} · ${when}`;
  if (kind === "payment_submitted") return `Ref ${b.paymentRef} · ${slot}`;
  if (kind === "hold_released") return `${b.cancelReason ?? "Cancelled automatically."} ${slot}`;
  return slot;
}

/**
 * Adds a notification for the booking's owner. Never throws: a failed
 * notification shouldn't fail the booking change that raised it.
 */
export async function notify(kind: NotificationKind, b: Booking): Promise<void> {
  try {
    const n: AppNotification = {
      id: randomBytes(6).toString("hex"),
      kind,
      bookingId: b.id,
      title: titles[kind](b),
      body: await describe(kind, b),
      at: new Date().toISOString(),
    };
    await updateNotifications(b.ownerId, (all) => [n, ...all].slice(0, MAX_KEPT));
  } catch (err) {
    console.error(`Notification for ${b.id} failed:`, err);
  }
}

/** Newest first. */
export function listNotifications(ownerId: string) {
  return readNotifications(ownerId);
}

export function unreadCount(all: AppNotification[]) {
  return all.filter((n) => !n.readAt).length;
}

/** Marks the given notifications read, or every one when `ids` is omitted. */
export function markRead(ownerId: string, ids?: string[]) {
  const at = new Date().toISOString();
  return updateNotifications(ownerId, (all) => all.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: at } : n)));
}
