"use client";

import { useTransition } from "react";
import { useDialog } from "../../dialog";
import { cancelScheduledRate, endPromo } from "./actions";

export function RateActions({ id, scope, scheduled, ended }: { id: string; scope: "platform" | "owner"; scheduled: boolean; ended: boolean }) {
  const [pending, start] = useTransition();
  const { alert, confirm } = useDialog();
  const btn = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30";

  if (scope === "owner" && !ended)
    return (
      <button
        className={btn}
        disabled={pending}
        onClick={async () => {
          const ok = await confirm(scheduled ? "It's removed before it starts." : "It ends after today's bookings.", {
            title: scheduled ? "Remove this promo?" : "End this promo?",
            confirmLabel: scheduled ? "Remove" : "End promo",
            danger: true,
          });
          if (!ok) return;
          start(async () => {
            const r = await endPromo(id);
            if (!r.ok) await alert(r.message);
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
        onClick={async () => {
          if (!(await confirm("It won't take effect.", { title: "Cancel this scheduled rate?", confirmLabel: "Cancel rate", cancelLabel: "Keep it", danger: true })))
            return;
          start(async () => {
            const r = await cancelScheduledRate(id);
            if (!r.ok) await alert(r.message);
          });
        }}
      >
        Cancel
      </button>
    );
  return null;
}
