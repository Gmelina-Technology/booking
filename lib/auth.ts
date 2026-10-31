import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifySessionToken, type Session } from "./session";
import { getOwnerById, type Owner } from "./store";

/** The owner's current session version. Sessions signed with an older one are revoked. */
export function sessionVersion(owner: Pick<Owner, "sessionVersion">) {
  return owner.sessionVersion ?? 0;
}

/** Signs the owner in on this browser for SESSION_DAYS. */
export async function startSession(owner: Pick<Owner, "id" | "sessionVersion">): Promise<void> {
  const { token, expires } = await createSessionToken(owner.id, sessionVersion(owner));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

async function currentSession(): Promise<Session | null> {
  // Session expiry depends on the current time, so this always runs at request time.
  await connection();
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * The owner id in a validly signed session, without checking for revocation.
 * Only for choosing what to show (e.g. header links); use currentOwner() or
 * requireOwner() before reading or changing anything.
 */
export async function currentOwnerId(): Promise<string | null> {
  return (await currentSession())?.ownerId ?? null;
}

/** The signed-in owner, or null if signed out or the session was revoked. */
export async function currentOwner(): Promise<Owner | null> {
  const session = await currentSession();
  if (!session) return null;
  const owner = await getOwnerById(session.ownerId);
  return owner && sessionVersion(owner) === session.version ? owner : null;
}

/**
 * Call at the top of every staff-only server action and every admin data
 * component, and scope everything it reads or writes to the returned owner.
 * proxy.ts only redirects page visits; server actions can be invoked
 * directly, so each one must check for itself.
 */
export async function requireOwner(): Promise<Owner> {
  const owner = await currentOwner();
  if (!owner) redirect("/login");
  return owner;
}

/** The visitor's IP, for rate limits. Vercel and most proxies set x-forwarded-for. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Accounts listed in PLATFORM_ADMIN_EMAILS (comma-separated) run the platform itself, e.g. partner fee rates. */
export function isPlatformAdmin(owner: Pick<Owner, "email">): boolean {
  const emails = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return emails.includes(owner.email);
}

/** Like requireOwner(), for platform-admin pages and actions. Anyone else gets a 404, so the page isn't advertised. */
export async function requirePlatformAdmin(): Promise<Owner> {
  const owner = await requireOwner();
  if (!isPlatformAdmin(owner)) notFound();
  return owner;
}
