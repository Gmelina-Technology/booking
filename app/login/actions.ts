"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, createSessionToken, SESSION_COOKIE } from "@/lib/session";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Failed attempts per IP, in memory. Good enough for a single server; use a
// shared store (Redis, database) if the site runs on several instances.
const failures = new Map<string, { count: number; until: number }>();

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
  const now = Date.now();
  for (const [key, r] of failures) if (r.until <= now) failures.delete(key);
  const record = failures.get(ip);
  if (record && record.count >= MAX_ATTEMPTS && record.until > now) {
    const minutes = Math.ceil((record.until - now) / 60000);
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  if (!passwordMatches(String(form.get("password") ?? ""), process.env.STAFF_PASSWORD!)) {
    const count = record && record.until > now ? record.count + 1 : 1;
    failures.set(ip, { count, until: now + LOCKOUT_MS });
    return "Wrong password.";
  }

  failures.delete(ip);
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
