"use client";

import type { Map, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { defaultCenter, type LatLng } from "@/lib/geo";
import { createMap } from "@/lib/map";
import type { Venue } from "@/lib/venues";

type Pinned = Venue & LatLng;

/** Venues as pins, plus the player's own spot once they tap "Near me". */
export default function VenueMap({ venues, here }: { venues: Pinned[]; here: LatLng | null }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: Map; you: Marker } | null>(null);

  useEffect(() => {
    let gone = false;
    const markers: Marker[] = [];
    createMap(box.current!, venues[0] ?? defaultCenter, 11).then(({ ml, map: m }) => {
      if (gone) return m.remove();
      const bounds = new ml.LngLatBounds();
      for (const v of venues) {
        // Built with textContent: names and addresses are typed by owners.
        const card = document.createElement("a");
        card.href = v.href;
        card.className = "block text-sm";
        const name = card.appendChild(document.createElement("strong"));
        name.textContent = v.name;
        if (v.address) card.appendChild(document.createElement("span")).textContent = ` · ${v.address}`;
        card.appendChild(document.createElement("span")).textContent = " Book →";
        card.lastElementChild!.className = "block font-semibold text-emerald-700";
        markers.push(
          new ml.Marker({ color: "#047857" }).setLngLat([v.lng, v.lat]).setPopup(new ml.Popup({ offset: 24 }).setDOMContent(card)).addTo(m),
        );
        bounds.extend([v.lng, v.lat]);
      }
      if (venues.length > 1) m.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      else if (venues.length === 1) m.jumpTo({ zoom: 14 });
      map.current = { map: m, you: new ml.Marker({ color: "#2563eb", scale: 0.8 }) };
      if (here) showYou(map.current, here);
    });
    return () => {
      gone = true;
      markers.forEach((mk) => mk.remove());
      map.current?.map.remove();
      map.current = null;
    };
    // Rebuilt only when the venues change; `here` is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venues]);

  useEffect(() => {
    if (here && map.current) showYou(map.current, here);
  }, [here]);

  return <div ref={box} className="mt-6 h-[28rem] overflow-hidden rounded-2xl border border-black/5 bg-black/5 sm:mt-8" />;
}

function showYou(m: { map: Map; you: Marker }, at: LatLng) {
  m.you.setLngLat([at.lng, at.lat]).addTo(m.map);
  m.map.flyTo({ center: [at.lng, at.lat], zoom: 13 });
}
