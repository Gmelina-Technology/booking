"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentViewingAs, requirePlatformAdmin, sessionVersion } from "@/lib/auth";
import { createViewAsToken, VIEW_AS_COOKIE } from "@/lib/session";
import { getOwnerById, logViewAs } from "@/lib/store";

// Platform-admin only: lets an admin use the staff area as one partner, e.g.
// to help with support. Their own session stays as it is; the partner is held
// in a separate cookie for VIEW_AS_MINUTES (lib/session.ts), and every start
// and stop is logged. Account changes stay with the partner (requireAccountHolder).

export async function startViewingAs(ownerId: string): Promise<void> {
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
  redirect("/admin");
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
  redirect(viewing ? "/admin/partners" : "/admin");
}
