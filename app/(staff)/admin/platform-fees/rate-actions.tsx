"use client";

import { useTransition } from "react";
import { cancelScheduledRate, endPromo } from "./actions";

export function RateActions({ id, scope, scheduled, ended }: { id: string; scope: "platform" | "owner"; scheduled: boolean; ended: boolean }) {
  const [pending, start] = useTransition();
  const btn = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30";

  if (scope === "owner" && !ended)
    return (
      <button
        className={btn}
        disabled={pending}
        onClick={() => {
          if (!confirm(scheduled ? "Remove this promo before it starts?" : "End this promo after today's bookings?")) return;
          start(async () => {
            const r = await endPromo(id);
            if (!r.ok) alert(r.message);
          });
        }}
      >
        {scheduled ? "Remove" : "End promo"}
      </button>
    );
  if (scope === "platform" && scheduled)
    return (
      <button
        className={btn}
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this scheduled rate?")) return;
          start(async () => {
            const r = await cancelScheduledRate(id);
            if (!r.ok) alert(r.message);
          });
        }}
      >
        Cancel
      </button>
    );
  return null;
}
