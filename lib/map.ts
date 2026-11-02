import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, type LatLng } from "./geo";

// Browser-only: MapLibre needs `window`, so it's loaded on demand from an effect.

export async function createMap(container: HTMLElement, center: LatLng, zoom: number) {
  const ml = await import("maplibre-gl");
  // Copied into public/ by scripts/copy-map-worker.mts; the version busts old caches.
  ml.setWorkerUrl(`/maplibre-gl-worker.mjs?v=${ml.getVersion()}`);
  // Each map gets its own element: an effect that re-runs (Strict Mode) can
  // remove its late map without stripping the classes off the next one.
  const el = container.appendChild(document.createElement("div"));
  el.className = "h-full w-full";
  const map = new ml.Map({
    container: el,
    style: mapStyle,
    center: [center.lng, center.lat],
    zoom,
    attributionControl: { compact: true },
    cooperativeGestures: true,
  });
  map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
  map.on("remove", () => el.remove());
  return { ml, map };
}
