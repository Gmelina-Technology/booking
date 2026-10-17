import { headers } from "next/headers";

/**
 * Absolute base URL for links in emails: SITE_URL if set (e.g.
 * https://courtsidehub.ph), else Vercel's production domain, else the
 * current request's host.
 */
export async function siteUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  // Set automatically on Vercel: the production domain, without protocol.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
