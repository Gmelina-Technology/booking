"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { clearLoginFailures, getLoginFailure, recordLoginFailure } from "@/lib/store";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Failed attempts are counted per IP in the store (the database in production),
// so the lockout holds across all serverless instances.

function passwordMatches(given: string, expected: string) {
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Only redirect back to staff pages, never to another site. */
function safeNext(next: unknown) {
  return typeof next === "string" && /^\/admin(\/|\?|$)/.test(next) ? next : "/admin";
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!authConfigured()) return "Staff login isn't set up on this server yet. See the README.";

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  const record = await getLoginFailure(ip);
  if (record && record.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((record.untilMs - Date.now()) / 60000);
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  if (!passwordMatches(String(form.get("password") ?? ""), process.env.STAFF_PASSWORD!)) {
    await recordLoginFailure(ip, LOCKOUT_MS);
    return "Wrong password.";
  }

  await clearLoginFailures(ip);
  const { token, expires } = await createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
