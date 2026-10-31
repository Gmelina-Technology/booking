import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createSessionToken, SESSION_COOKIE, VIEW_AS_COOKIE, verifySessionToken, verifyViewAsToken, type Session } from "./session";
import { getOwnerById, type Owner } from "./store";

/** The owner's current session version. Sessions signed with an older one are revoked. */
export function sessionVersion(owner: Pick<Owner, "sessionVersion">) {
  return owner.sessionVersion ?? 0;
}

/** Signs the owner in on this browser for SESSION_DAYS, ending any "view as" left from before. */
export async function startSession(owner: Pick<Owner, "id" | "sessionVersion">): Promise<void> {
  const { token, expires } = await createSessionToken(owner.id, sessionVersion(owner));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  jar.delete(VIEW_AS_COOKIE);
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

/**
 * The account actually signed in on this browser, or null if signed out or the
 * session was revoked. Unlike currentOwner(), never the partner a platform admin
 * is viewing as.
 */
export async function currentAccount(): Promise<Owner | null> {
  const session = await currentSession();
  if (!session) return null;
  const owner = await getOwnerById(session.ownerId);
  return owner && sessionVersion(owner) === session.version ? owner : null;
}

/** A platform admin using the staff area as a partner (admin/partners/actions.ts). */
export type ViewingAs = { admin: Owner; partner: Owner; expires: Date };

/**
 * Who the signed-in platform admin is viewing as, or null. The view-as cookie
 * only counts alongside the same admin's current session, so it ends when they
 * sign out, their sessions are revoked, or they stop being a platform admin.
 */
export async function currentViewingAs(): Promise<ViewingAs | null> {
  const session = await currentSession();
  const viewAs = await verifyViewAsToken((await cookies()).get(VIEW_AS_COOKIE)?.value);
  if (!session || !viewAs || viewAs.adminId !== session.ownerId || viewAs.adminVersion !== session.version) return null;
  const [admin, partner] = await Promise.all([getOwnerById(viewAs.adminId), getOwnerById(viewAs.ownerId)]);
  if (!admin || sessionVersion(admin) !== session.version || !isPlatformAdmin(admin) || !partner || partner.id === admin.id) return null;
  return { admin, partner, expires: viewAs.expires };
}

/**
 * The owner whose staff area this is: the signed-in owner, or the partner a
 * platform admin is viewing as. Null if signed out or the session was revoked.
 */
export async function currentOwner(): Promise<Owner | null> {
  return (await currentViewingAs())?.partner ?? (await currentAccount());
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

/**
 * Like requireOwner(), for the account itself: sign-in email, password,
 * sessions, deletion and agreeing to fee terms. Only the partner may do these,
 * so a platform admin viewing as them is sent to the page that says so.
 */
export async function requireAccountHolder(): Promise<Owner> {
  if (await currentViewingAs()) redirect("/admin/account");
  return requireOwner();
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

/**
 * Like requireOwner(), for platform-admin pages and actions. Anyone else gets a
 * 404, so the page isn't advertised. Checks the signed-in account, so it keeps
 * working while the admin is viewing as a partner.
 */
export async function requirePlatformAdmin(): Promise<Owner> {
  const account = await currentAccount();
  if (!account) redirect("/login");
  if (!isPlatformAdmin(account)) notFound();
  return account;
}
