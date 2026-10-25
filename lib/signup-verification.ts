import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Email verification for sign-up. Nothing is written to the accounts store
// until the person proves they own the email by entering the 6-digit code we
// sent to it, so bots can't mass-create pages with made-up addresses.
//
// The pending sign-up (details, password hash and code) lives in an HTTP-only
// cookie, encrypted and authenticated with AES-256-GCM under a key derived
// from SESSION_SECRET, so the browser can neither read the code nor alter the
// details. Wrong-code attempts are counted in the store by the sign-up's nonce,
// so replaying an old cookie doesn't reset the count.

export const PENDING_SIGNUP_COOKIE = "signup_pending";
export const CODE_MINUTES = 10;

export type PendingSignup = {
  name: string;
  handle: string;
  email: string;
  passwordHash: string;
  code: string;
  /** Random id for this code, used to count wrong attempts. */
  nonce: string;
  /** Unix ms after which the code no longer works. */
  exp: number;
};

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(`signup-verification:${s}`).digest();
}

/** A fresh 6-digit code, e.g. "042917". */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sealPendingSignup(details: Omit<PendingSignup, "code" | "nonce" | "exp">, code: string, now = Date.now()) {
  const pending: PendingSignup = { ...details, code, nonce: randomBytes(12).toString("hex"), exp: now + CODE_MINUTES * 60_000 };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(pending), "utf8"), cipher.final()]);
  return { pending, token: [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".") };
}

/** The pending sign-up in the cookie, or null if it's missing, tampered with or unreadable. Expiry is checked by the caller. */
export function openPendingSignup(token: string | undefined): PendingSignup | null {
  if (!token) return null;
  try {
    const [iv, tag, body] = token.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export function codeMatches(expected: string, entered: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(entered);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Shows "j***@example.com" so the page confirms where the code went without echoing the full address. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}
