import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing with scrypt (built into Node). Stored as
// "scrypt$<N>$<salt base64url>$<hash base64url>" so the cost can be raised later.

const N = 16384;
const KEY_LENGTH = 64;
export { MIN_PASSWORD_LENGTH } from "./password-rules";

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  const options: ScryptOptions = { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = `scrypt$${N}$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(KEY_LENGTH).toString("base64url")}`;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [scheme, cost, salt, hash] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(cost));
  return !!stored && actual.length === expected.length && timingSafeEqual(actual, expected);
}
