import { platform } from "./facility";
import { isLatLng, type LatLng } from "./geo";
import { siteUrl } from "./site-url";

// Address -> map pin through OpenStreetMap's free Nominatim service. Its usage
// policy asks for an identifying User-Agent and at most one request a second,
// so this only runs when an owner places their address (rate-limited by the
// caller) and the result is saved on the profile, never per player visit.

export async function geocode(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (q.length < 3) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "ph" }).toString();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `${platform.name} booking (${await siteUrl()})`, "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    const point = hit && { lat: Number(hit.lat), lng: Number(hit.lon) };
    return point && isLatLng(point.lat, point.lng) ? point : null;
  } catch {
    return null;
  }
}
