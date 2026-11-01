"use server";

import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { currentViewingAs, isPlatformAdmin, requirePlatformAdmin, sessionVersion } from "@/lib/auth";
import { partnerStatusEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";
import { OWNERS_TAG } from "@/lib/owners";
import { createViewAsToken, VIEW_AS_COOKIE } from "@/lib/session";
import { getOwnerById, logPartnerChange, logViewAs, updateOwner } from "@/lib/store";

// Platform-admin only: lets an admin use the staff area as one partner, e.g.
// to help with support. Their own session stays as it is; the partner is held
// in a separate cookie for VIEW_AS_MINUTES (lib/session.ts), and every start
// and stop is logged. Account changes stay with the partner (requireAccountHolder).
//
// Admins can also suspend a partner (their page goes offline, see
// lib/owners.ts) and reinstate them. Both are logged and emailed to the partner.

/** Where "View as" may land: a page of the partner dashboard, e.g. /app/bookings?booking=AB12CD34. */
const SAFE_NEXT = /^\/app(\/[a-z-]+)*(\?[A-Za-z0-9=&_-]*)?$/;

/**
 * `next` is bound by the page (e.g. to open one booking). Forms that only bind
 * `ownerId` pass their FormData in its place, which is ignored.
 */
export async function startViewingAs(ownerId: string, next?: unknown): Promise<void> {
  const admin = await requirePlatformAdmin();
  const partner = await getOwnerById(ownerId);
  if (!partner || partner.id === admin.id) redirect("/admin/partners");

  const { token, expires } = await createViewAsToken({ ownerId: admin.id, version: sessionVersion(admin) }, partner.id);
  (await cookies()).set(VIEW_AS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  await logViewAs({ at: new Date().toISOString(), event: "start", adminEmail: admin.email, ownerId: partner.id, ownerHandle: partner.handle });
  redirect(typeof next === "string" && SAFE_NEXT.test(next) ? next : "/app");
}

export async function stopViewingAs(): Promise<void> {
  const viewing = await currentViewingAs();
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (viewing)
    await logViewAs({
      at: new Date().toISOString(),
      event: "stop",
      adminEmail: viewing.admin.email,
      ownerId: viewing.partner.id,
      ownerHandle: viewing.partner.handle,
    });
  redirect(viewing ? "/admin/partners" : "/app");
}

export type SuspendState = { error: string | null };

/** Takes the partner's page offline. They keep their account and existing bookings. */
export async function suspendPartner(ownerId: string, _prev: SuspendState, form: FormData): Promise<SuspendState> {
  const admin = await requirePlatformAdmin();
  const reason = String(form.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (reason.length < 5) return { error: "Say why in a few words. The partner sees this reason." };
  const partner = await getOwnerById(ownerId);
  if (!partner) return { error: "That partner no longer exists." };
  if (partner.id === admin.id || isPlatformAdmin(partner))
    return { error: "Platform admin accounts can't be suspended. Remove the email from PLATFORM_ADMIN_EMAILS first." };

  const at = new Date().toISOString();
  const updated = await updateOwner(partner.id, (o) => {
    o.suspension ??= { at, by: admin.email, reason };
  });
  // Someone else suspended them a moment ago: nothing more to do.
  if (updated?.suspension?.at !== at) return refreshed();

  await logPartnerChange({ at, event: "suspend", adminEmail: admin.email, ownerId: partner.id, ownerHandle: partner.handle, reason });
  updateTag(OWNERS_TAG);
  after(() => mailPartner(partner.email, partner.profile.name, reason));
  return refreshed();
}

/** Puts a suspended partner's page back online. */
export async function reinstatePartner(ownerId: string): Promise<void> {
  const admin = await requirePlatformAdmin();
  let wasSuspended = false;
  const partner = await updateOwner(ownerId, (o) => {
    wasSuspended = !!o.suspension;
    delete o.suspension;
  });
  if (!partner || !wasSuspended) return void refresh();

  await logPartnerChange({ at: new Date().toISOString(), event: "reinstate", adminEmail: admin.email, ownerId: partner.id, ownerHandle: partner.handle });
  updateTag(OWNERS_TAG);
  after(() => mailPartner(partner.email, partner.profile.name, null));
  refresh();
}

function refreshed(): SuspendState {
  refresh();
  return { error: null };
}

/** `reason` when suspended, null when reinstated. */
async function mailPartner(to: string, business: string, reason: string | null) {
  const result = await sendMail(partnerStatusEmail(to, business, reason));
  if (!result.ok) console.error("Partner status email failed:", result.detail);
}
