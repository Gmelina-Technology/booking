// Signed owner session tokens. Uses Web Crypto only, so it runs in proxy.ts
// as well as in server components and actions.
//
// Token format: "<owner id>.<session version>.<expiry unix seconds>.<base64url HMAC-SHA256 of the rest>".
// The HMAC key is SESSION_SECRET, so rotating that secret logs everyone out.
//
// The signature alone is enough for proxy.ts to redirect visitors. The version
// is checked against the owner's record in lib/auth.ts (currentOwner), and the
// owner's version goes up on "Sign out on all devices" and on a password
// reset, which revokes every session issued before.

export const SESSION_COOKIE = "owner_session";
export const SESSION_DAYS = 7;

const encoder = new TextEncoder();

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

/** True when the env var needed for sign-in is set. */
export function authConfigured(): boolean {
  return !!secret();
}

async function hmacKey(s: string) {
  return crypto.subtle.importKey("raw", encoder.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

export type Session = { ownerId: string; version: number };

export async function createSessionToken(ownerId: string, version: number, now = Date.now()): Promise<{ token: string; expires: Date }> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET is not set");
  if (!/^[a-f0-9]+$/.test(ownerId)) throw new Error("Invalid owner id");
  if (!Number.isInteger(version) || version < 0) throw new Error("Invalid session version");
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const payload = `${ownerId}.${version}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(s), encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(sig)}`, expires: new Date(exp * 1000) };
}

/**
 * Returns the session in the token, or null if it's missing, forged or expired.
 * Doesn't check whether the session was revoked: lib/auth.ts does that.
 */
export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<Session | null> {
  const s = secret();
  if (!s || !token) return null;
  const [ownerId, version, exp, sig, ...rest] = token.split(".");
  if (rest.length || !/^[a-f0-9]+$/.test(ownerId ?? "") || !/^\d+$/.test(version ?? "") || !/^\d+$/.test(exp ?? "") || !sig) return null;
  if (Number(exp) * 1000 <= now) return null;
  const sigBytes = Uint8Array.from(Buffer.from(sig, "base64url"));
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(s), sigBytes, encoder.encode(`${ownerId}.${version}.${exp}`));
  return ok ? { ownerId, version: Number(version) } : null;
}
