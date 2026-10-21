import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { BusinessProfile } from "./facility";
import { getOwnerById, listOwners } from "./store";

export const OWNERS_TAG = "owners";

/** What anyone may see about a business. Never includes the sign-in email or password hash. */
export type PublicOwner = { id: string; handle: string; profile: BusinessProfile };

/** Every business, oldest first. Cached until someone signs up or edits their profile. */
export async function getPublicOwners(): Promise<PublicOwner[]> {
  "use cache";
  cacheLife("max");
  cacheTag(OWNERS_TAG);
  return (await listOwners()).map(({ id, handle, profile }) => ({ id, handle, profile }));
}

export async function getPublicOwner(handle: string): Promise<PublicOwner | undefined> {
  const h = normalizeHandle(handle);
  return (await getPublicOwners()).find((o) => o.handle === h);
}

export async function getPublicOwnerById(id: string): Promise<PublicOwner | undefined> {
  const cached = (await getPublicOwners()).find((o) => o.id === id);
  if (cached) return cached;
  // Not in the cache yet (e.g. a moment after sign-up): read it directly.
  const owner = await getOwnerById(id);
  return owner && { id: owner.id, handle: owner.handle, profile: owner.profile };
}

/** Handles are 3–30 lowercase letters, digits and single hyphens, not starting or ending with one. */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,29}$/;

/** Words that would be confusing (or look official) as a business page. */
const RESERVED = new Set([
  "admin", "api", "app", "book", "booking", "bookings", "dashboard", "help", "login", "logout", "me",
  "new", "official", "p", "platform", "root", "settings", "signin", "signup", "staff", "support",
  "system", "uploads", "www",
]);

export function handleError(handle: string): string | null {
  if (!HANDLE_PATTERN.test(handle)) return "Use 3–30 lowercase letters, numbers or hyphens.";
  if (RESERVED.has(handle)) return "That handle is reserved. Try another.";
  return null;
}

/** Accepts "@name", "%40name" or "name" from a URL and returns "name". */
export function normalizeHandle(raw: string) {
  let h = raw;
  try {
    h = decodeURIComponent(raw);
  } catch {}
  return h.replace(/^@/, "").toLowerCase();
}

/** Public URL of a business page, e.g. ownerPath("acme", "/activities/tennis") -> "/p/@acme/activities/tennis". */
export function ownerPath(handle: string, rest = "") {
  return `/p/@${handle}${rest}`;
}

/** Resolves a /p/[handle] route's params to a business, or shows the 404 page. */
export async function ownerFromParams(params: Promise<{ handle: string }>): Promise<PublicOwner> {
  const owner = await getPublicOwner((await params).handle);
  if (!owner) notFound();
  return owner;
}
