import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Owner } from "./store";

// Changing the sign-in email. The owner asks from /app/account (with their
// password); we email a link to the NEW address, so the change only happens
// once they prove they can read it. The link opens /account/confirm-email/<token>.
//
// Token format: "<owner id>.<expiry unix seconds>.<new email, base64url>.<base64url HMAC>".
// The HMAC also covers the CURRENT email, so a link stops working once the
// email changes: it works once, and older links die when one is used.

export const EMAIL_CHANGE_MINUTES = 60;

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(`email-change:${s}`).digest();
}

function sign(ownerId: string, exp: number, newEmail: string, currentEmail: string) {
  return createHmac("sha256", key()).update(`${ownerId}.${exp}.${newEmail}.${currentEmail}`).digest();
}

export function createEmailChangeToken(owner: Pick<Owner, "id" | "email">, newEmail: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + EMAIL_CHANGE_MINUTES * 60;
  const encoded = Buffer.from(newEmail).toString("base64url");
  return `${owner.id}.${exp}.${encoded}.${sign(owner.id, exp, newEmail, owner.email).toString("base64url")}`;
}

/** What the link asks for, or null if it's malformed or expired. Check it against the owner with emailChangeMatches. */
export function readEmailChangeToken(token: string, now = Date.now()): { ownerId: string; newEmail: string } | null {
  const [ownerId, exp, encoded, sig, ...rest] = token.split(".");
  if (rest.length || !/^[a-f0-9]+$/.test(ownerId ?? "") || !/^\d+$/.test(exp ?? "") || !encoded || !sig) return null;
  if (Number(exp) * 1000 <= now) return null;
  const newEmail = Buffer.from(encoded, "base64url").toString("utf8");
  return newEmail.includes("@") ? { ownerId, newEmail } : null;
}

/** Whether `token` was signed for this owner while their email was what it is now. */
export function emailChangeMatches(owner: Pick<Owner, "id" | "email">, token: string): boolean {
  const [ownerId, exp, encoded, sig] = token.split(".");
  if (ownerId !== owner.id || !/^\d+$/.test(exp ?? "") || !encoded || !sig) return false;
  const expected = sign(owner.id, Number(exp), Buffer.from(encoded, "base64url").toString("utf8"), owner.email);
  const actual = Buffer.from(sig, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
