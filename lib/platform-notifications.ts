import { randomBytes } from "node:crypto";
import { partnerJoinedEmail } from "./emails";
import { sendMail } from "./mailer";
import { readPlatformNotifications, updatePlatformNotifications, type Owner } from "./store";
import type { PlatformNotification } from "./store-types";

// Notifications for platform admins (PLATFORM_ADMIN_EMAILS): shown in the same
// bell as their business's notifications (app/notification-actions.ts), and
// emailed. One shared document holds the latest MAX_KEPT; each admin has their
// own read state. Raised when a new partner finishes signing up.

export type { PlatformNotification } from "./store-types";

export const MAX_KEPT = 100;

/**
 * Tells platform admins a partner just signed up: an entry in their bell and
 * an email to each of `adminEmails`. Never throws: a failed alert shouldn't
 * fail the sign-up that raised it.
 */
export async function notifyPartnerJoined(owner: Owner, adminEmails: string[], baseUrl: string): Promise<void> {
  try {
    const n: PlatformNotification = {
      id: randomBytes(6).toString("hex"),
      kind: "partner_joined",
      ownerId: owner.id,
      title: `New partner: ${owner.profile.name}`,
      body: `@${owner.handle} · ${owner.email}`,
      at: new Date().toISOString(),
      readBy: [],
    };
    await updatePlatformNotifications((all) => [n, ...all].slice(0, MAX_KEPT));
  } catch (err) {
    console.error(`Platform notification for @${owner.handle} failed:`, err);
  }
  const link = `${baseUrl}/admin/partners/${owner.id}`;
  for (const to of adminEmails) {
    // An admin signing up their own business doesn't need to be told.
    if (to === owner.email) continue;
    const result = await sendMail(partnerJoinedEmail(to, owner, link));
    if (!result.ok) console.error("New partner email failed:", result.detail);
  }
}

/** Newest first. */
export function listPlatformNotifications() {
  return readPlatformNotifications();
}

export const isReadBy = (n: PlatformNotification, adminId: string) => n.readBy.includes(adminId);

/** Marks the given notifications read for one admin, or every one when `ids` is omitted. */
export function markPlatformRead(adminId: string, ids?: string[]) {
  return updatePlatformNotifications((all) =>
    all.map((n) => (!isReadBy(n, adminId) && (!ids || ids.includes(n.id)) ? { ...n, readBy: [...n.readBy, adminId] } : n)),
  );
}
