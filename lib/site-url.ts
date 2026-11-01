import { headers } from "next/headers";

/**
 * The site's public address from the environment: SITE_URL if set (e.g.
 * https://courtsidehub.ph), else Vercel's production domain, else null.
 * Used as metadataBase, so link previews point at absolute URLs.
 */
export function configuredSiteUrl(): string | null {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  // Set automatically on Vercel: the production domain, without protocol.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

/**
 * Absolute base URL for links in emails: configuredSiteUrl(), else the
 * current request's host.
 */
export async function siteUrl(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
