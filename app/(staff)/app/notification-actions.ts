"use server";

import { currentAccount, currentOwner, isPlatformAdmin, requireOwner } from "@/lib/auth";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications";
import { isReadBy, listPlatformNotifications, markPlatformRead } from "@/lib/platform-notifications";

// Staff-only, scoped to the signed-in owner. The bell (notifications.tsx) polls
// getNotifications(), so a signed-out or revoked session gets an empty list
// rather than a redirect in the middle of whatever page is open. Platform
// admins also get the platform's notifications (lib/platform-notifications.ts),
// read for their own account even while viewing as a partner.

/** One row in the bell: a business notification, or a platform one for admins. */
export type FeedItem = { id: string; title: string; body: string; at: string; read: boolean; href: string; platform: boolean };

export type NotificationFeed = { items: FeedItem[]; unread: number };

export async function getNotifications(): Promise<NotificationFeed> {
  const [owner, account] = await Promise.all([currentOwner(), currentAccount()]);
  if (!owner) return { items: [], unread: 0 };
  const admin = account && isPlatformAdmin(account) ? account : null;
  const [business, platform] = await Promise.all([listNotifications(owner.id), admin ? listPlatformNotifications() : []]);
  const items: FeedItem[] = [
    ...business.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      at: n.at,
      read: !!n.readAt,
      href: `/app/bookings?booking=${encodeURIComponent(n.bookingId)}`,
      platform: false,
    })),
    ...platform.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      at: n.at,
      read: isReadBy(n, admin!.id),
      href: `/admin/partners/${encodeURIComponent(n.ownerId)}`,
      platform: true,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { items, unread: unreadCount(business) + items.filter((i) => i.platform && !i.read).length };
}

/** Marks the given notifications read, or all of them when `ids` is omitted. */
export async function markNotificationsRead(ids?: string[]): Promise<NotificationFeed> {
  const owner = await requireOwner();
  if (ids && !(Array.isArray(ids) && ids.every((id) => typeof id === "string"))) throw new Error("Invalid ids");
  const account = await currentAccount();
  await Promise.all([markRead(owner.id, ids), account && isPlatformAdmin(account) ? markPlatformRead(account.id, ids) : null]);
  return getNotifications();
}
