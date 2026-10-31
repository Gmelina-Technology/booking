"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, requireOwner, sessionVersion, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { authConfigured, SESSION_COOKIE } from "@/lib/session";
import { clearLoginFailures, getLoginFailure, getOwnerByEmail, recordLoginFailure, updateOwner } from "@/lib/store";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Failed attempts are counted per IP in the store (the database in production),
// so the lockout holds across all serverless instances.

/** Only redirect back to staff pages, never to another site. */
function safeNext(next: unknown) {
  return typeof next === "string" && /^\/(app|admin)(\/|\?|$)/.test(next) ? next : "/app";
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!authConfigured()) return "Sign-in isn't set up on this server yet (SESSION_SECRET is missing). See the README.";

  const ip = await clientIp();
  const record = await getLoginFailure(ip);
  if (record && record.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((record.untilMs - Date.now()) / 60000);
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  const owner = await getOwnerByEmail(String(form.get("email") ?? ""));
  // Always run the hash check, so an unknown email takes as long as a wrong password.
  if (!(await verifyPassword(String(form.get("password") ?? ""), owner?.passwordHash)) || !owner) {
    await recordLoginFailure(ip, LOCKOUT_MS);
    return "Wrong email or password.";
  }

  await clearLoginFailures(ip);
  await startSession(owner);
  redirect(safeNext(form.get("next")));
}

/** Signs out this browser only. */
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** Revokes every session for this account, on every device (e.g. after losing a phone). */
export async function logoutEverywhere() {
  const owner = await requireOwner();
  await updateOwner(owner.id, (o) => {
    o.sessionVersion = sessionVersion(o) + 1;
  });
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?signedOut=all");
}
