import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "./session";
import { getOwnerById, type Owner } from "./store";

/** Signs the owner in on this browser for SESSION_DAYS. */
export async function startSession(ownerId: string): Promise<void> {
  const { token, expires } = await createSessionToken(ownerId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** The signed-in owner's id, if the request carries a valid session. */
export async function currentOwnerId(): Promise<string | null> {
  // Session expiry depends on the current time, so this always runs at request time.
  await connection();
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The signed-in owner, or null. */
export async function currentOwner(): Promise<Owner | null> {
  const id = await currentOwnerId();
  return (id && (await getOwnerById(id))) || null;
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
