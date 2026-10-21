// Signed owner session tokens. Uses Web Crypto only, so it runs in proxy.ts
// as well as in server components and actions.
//
// Token format: "<owner id>.<expiry unix seconds>.<base64url HMAC-SHA256 of "<owner id>.<expiry>">".
// The HMAC key is SESSION_SECRET, so rotating that secret logs everyone out.

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

export async function createSessionToken(ownerId: string, now = Date.now()): Promise<{ token: string; expires: Date }> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET is not set");
  if (!/^[a-f0-9]+$/.test(ownerId)) throw new Error("Invalid owner id");
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const payload = `${ownerId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(s), encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(sig)}`, expires: new Date(exp * 1000) };
}

/** Returns the signed-in owner's id, or null if the token is missing, forged or expired. */
export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<string | null> {
  const s = secret();
  if (!s || !token) return null;
  const [ownerId, exp, sig] = token.split(".");
  if (!/^[a-f0-9]+$/.test(ownerId ?? "") || !/^\d+$/.test(exp ?? "") || !sig) return null;
  if (Number(exp) * 1000 <= now) return null;
  const sigBytes = Uint8Array.from(Buffer.from(sig, "base64url"));
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(s), sigBytes, encoder.encode(`${ownerId}.${exp}`));
  return ok ? ownerId : null;
}
