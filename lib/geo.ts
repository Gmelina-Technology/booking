// Distances for "venues near me". Pure, so it runs in the browser and in tests.

export type LatLng = { lat: number; lng: number };

/** Manila, where the map starts before a venue has a pin. */
export const defaultCenter: LatLng = { lat: 14.5995, lng: 120.9842 };

/** Free vector map style (OpenStreetMap data, no API key). Its host is allowed in next.config.ts. */
export const mapStyle = "https://tiles.openfreemap.org/styles/liberty";

export function isLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** Straight-line distance on the earth's surface. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "850 m", "2.3 km", "18 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
