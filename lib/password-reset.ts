import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { RESET_MINUTES } from "./password-rules";
import { getOwnerById, type Owner } from "./store";

export { RESET_MINUTES };

// Password-reset links: /reset-password/<token>, emailed to the owner.
//
// Token format: "<owner id>.<expiry unix seconds>.<base64url HMAC>". The HMAC
// covers the owner's current password hash as well as the id and expiry, so a
// link stops working as soon as the password changes: each link works once,
// and older links die when a newer one is used. Nothing is stored server-side.

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(`password-reset:${s}`).digest();
}

function sign(ownerId: string, exp: number, passwordHash: string) {
  return createHmac("sha256", key()).update(`${ownerId}.${exp}.${passwordHash}`).digest();
}

export function createResetToken(owner: Pick<Owner, "id" | "passwordHash">, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + RESET_MINUTES * 60;
  return `${owner.id}.${exp}.${sign(owner.id, exp, owner.passwordHash).toString("base64url")}`;
}

/** The owner the link is for, or null if it's malformed, forged, expired or already used. */
export async function ownerForResetToken(token: string, now = Date.now()): Promise<Owner | null> {
  const [ownerId, exp, sig] = token.split(".");
  if (!/^[a-f0-9]+$/.test(ownerId ?? "") || !/^\d+$/.test(exp ?? "") || !sig) return null;
  if (Number(exp) * 1000 <= now) return null;
  const owner = await getOwnerById(ownerId);
  if (!owner) return null;
  return resetTokenMatches(owner, token) ? owner : null;
}

/** Whether `token` was signed for this owner's current password. Used again inside the update, so a link can't be used twice at once. */
export function resetTokenMatches(owner: Pick<Owner, "id" | "passwordHash">, token: string): boolean {
  const [ownerId, exp, sig] = token.split(".");
  if (ownerId !== owner.id || !/^\d+$/.test(exp ?? "") || !sig) return false;
  const expected = sign(owner.id, Number(exp), owner.passwordHash);
  const actual = Buffer.from(sig, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
