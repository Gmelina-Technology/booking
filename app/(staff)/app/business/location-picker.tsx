"use client";

import type { Map, Marker } from "maplibre-gl";
import { useEffect, useRef, useState, useTransition } from "react";
import { defaultCenter, type LatLng } from "@/lib/geo";
import { createMap } from "@/lib/map";
import { toast } from "@/app/toaster";
import { locateAddress } from "./actions";

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Where the venue is on the map. Sent with the form as hidden `lat` / `lng`; empty means "place it from the address". */
export default function LocationPicker({ initial }: { initial: LatLng | null }) {
  const [pin, setPin] = useState(initial);
  const [finding, startFinding] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: Map; marker: Marker } | null>(null);

  useEffect(() => {
    let gone = false;
    createMap(box.current!, initial ?? defaultCenter, initial ? 16 : 11).then(({ ml, map: m }) => {
      if (gone) return m.remove();
      const marker = new ml.Marker({ color: "#047857", draggable: true });
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        setPin({ lat: round(at.lat), lng: round(at.lng) });
      });
      m.on("click", (e) => setPin({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) }));
      map.current = { map: m, marker };
      setPin((p) => (p ? { ...p } : p)); // draw the starting pin now that the map exists
    });
    return () => {
      gone = true;
      map.current?.map.remove();
      map.current = null;
    };
    // The map is created once; later pins move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (pin) m.marker.setLngLat([pin.lng, pin.lat]).addTo(m.map);
    else m.marker.remove();
  }, [pin]);

  function find(button: HTMLButtonElement) {
    const address = (button.form?.elements.namedItem("address") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!address) return toast.error("Type your address above first.");
    startFinding(async () => {
      const result = await locateAddress(address);
      if (!result.ok) return toast.error(result.message);
      setPin(result.pin);
      map.current?.map.flyTo({ center: [result.pin.lng, result.pin.lat], zoom: 16 });
      toast.success("Found it. Drag the pin if it's not exactly on your venue, then save.");
    });
  }

  return (
    <div className="text-sm">
      <span className="font-medium">Location on the map</span>
      <p className="text-xs text-black/50">Players use this to find venues near them. Click the map or drag the pin to your entrance.</p>
      <div ref={box} className="mt-2 h-64 overflow-hidden rounded-lg border border-black/15 bg-black/5" />
      <input type="hidden" name="lat" value={pin?.lat ?? ""} />
      <input type="hidden" name="lng" value={pin?.lng ?? ""} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={(e) => find(e.currentTarget)}
          disabled={finding}
          className="rounded-lg border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 disabled:opacity-60"
        >
          {finding ? "Finding…" : "Find my address on the map"}
        </button>
        {pin && (
          <button type="button" onClick={() => setPin(null)} className="text-black/60 hover:underline">
            Remove pin
          </button>
        )}
      </div>
    </div>
  );
}
