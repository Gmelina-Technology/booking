import { getRateLimit, hitRateLimit } from "./store";

/**
 * Counts one attempt against `key` and returns true when `max` attempts were
 * already made within the window (the attempt is refused and not counted).
 * Backed by the store, so limits hold across serverless instances.
 */
export async function overLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  if (((await getRateLimit(key))?.count ?? 0) >= max) return true;
  await hitRateLimit(key, windowMs);
  return false;
}
