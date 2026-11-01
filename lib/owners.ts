import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { BusinessProfile } from "./facility";
import { getOwnerById, listOwners, type Owner, type PagePause } from "./store";

export const OWNERS_TAG = "owners";

/**
 * What anyone may see about a business. Never includes the sign-in email or
 * password hash. `suspended` is only ever set by getPublicOwnerById(). `pause`
 * is there while the partner has paused their page: check it with isPaused().
 */
export type PublicOwner = { id: string; handle: string; profile: BusinessProfile; suspended?: boolean; pause?: PublicPause };

export type PublicPause = Pick<PagePause, "message" | "until">;

/**
 * Every business with a page, oldest first: suspended partners are left out,
 * so their page 404s and they leave the directory. Cached until someone signs
 * up, edits their profile, pauses or resumes their page, or a platform admin
 * suspends or reinstates them.
 */
export async function getPublicOwners(): Promise<PublicOwner[]> {
  "use cache";
  cacheLife("max");
  cacheTag(OWNERS_TAG);
  return (await listOwners()).filter((o) => !o.suspension).map(publicOwner);
}

/** The directory: businesses that paused their page are left out until it reopens. */
export async function getListedOwners(): Promise<PublicOwner[]> {
  return (await getPublicOwners()).filter((o) => !o.pause);
}

function publicOwner({ id, handle, profile, pause }: Owner): PublicOwner {
  return { id, handle, profile, ...(pause && { pause: { message: pause.message, ...(pause.until && { until: pause.until }) } }) };
}

/**
 * Whether a partner's pause still holds on `today` ("YYYY-MM-DD", facility
 * time). It ends by itself on its `until` date, and the daily sweep
 * (/api/cron/release-holds) then clears it.
 */
export function isPaused(pause: Pick<PagePause, "until"> | undefined, today: string): boolean {
  return !!pause && !(pause.until && today >= pause.until);
}

export async function getPublicOwner(handle: string): Promise<PublicOwner | undefined> {
  const h = normalizeHandle(handle);
  return (await getPublicOwners()).find((o) => o.handle === h);
}

/**
 * Any business by id, including suspended ones (marked `suspended`), so their
 * customers' booking links and emails keep working. Check `suspended` before
 * taking a new booking.
 */
export async function getPublicOwnerById(id: string): Promise<PublicOwner | undefined> {
  const cached = (await getPublicOwners()).find((o) => o.id === id);
  if (cached) return cached;
  // Suspended, or not in the cache yet (e.g. a moment after sign-up): read it directly.
  const owner = await getOwnerById(id);
  return owner && { ...publicOwner(owner), suspended: !!owner.suspension };
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
