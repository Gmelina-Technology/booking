"use server";

import { currentOwner, requireOwner } from "@/lib/auth";
import { listNotifications, markRead, unreadCount, type AppNotification } from "@/lib/notifications";

// Staff-only, scoped to the signed-in owner. The bell (notifications.tsx) polls
// getNotifications(), so a signed-out or revoked session gets an empty list
// rather than a redirect in the middle of whatever page is open.

export type NotificationFeed = { items: AppNotification[]; unread: number };

export async function getNotifications(): Promise<NotificationFeed> {
  const owner = await currentOwner();
  if (!owner) return { items: [], unread: 0 };
  const items = await listNotifications(owner.id);
  return { items, unread: unreadCount(items) };
}

/** Marks the given notifications read, or all of them when `ids` is omitted. */
export async function markNotificationsRead(ids?: string[]): Promise<NotificationFeed> {
  const owner = await requireOwner();
  if (ids && !(Array.isArray(ids) && ids.every((id) => typeof id === "string"))) throw new Error("Invalid ids");
  await markRead(owner.id, ids);
  return getNotifications();
}
