// Signed staff session tokens. Uses Web Crypto only, so it runs in proxy.ts
// as well as in server components and actions.
//
// Token format: "<expiry unix seconds>.<base64url HMAC-SHA256 of the expiry>".
// The HMAC key is SESSION_SECRET, so rotating that secret logs everyone out.

export const SESSION_COOKIE = "staff_session";
export const SESSION_DAYS = 7;

const encoder = new TextEncoder();

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

/** True when both env vars needed for staff login are set. */
export function authConfigured(): boolean {
  return !!secret() && !!process.env.STAFF_PASSWORD;
}

async function hmacKey(s: string) {
  return crypto.subtle.importKey("raw", encoder.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

export async function createSessionToken(now = Date.now()): Promise<{ token: string; expires: Date }> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET is not set");
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(s), encoder.encode(String(exp)));
  return { token: `${exp}.${toBase64Url(sig)}`, expires: new Date(exp * 1000) };
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  const s = secret();
  if (!s || !token) return false;
  const [exp, sig] = token.split(".");
  if (!/^\d+$/.test(exp ?? "") || !sig) return false;
  if (Number(exp) * 1000 <= now) return false;
  const sigBytes = Uint8Array.from(Buffer.from(sig, "base64url"));
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", await hmacKey(s), sigBytes, encoder.encode(exp));
}
