"use client";

import { useTransition } from "react";
import { toast } from "@/app/toaster";
import { dismissPageBanner, takePageBannerAction } from "./page-banner-actions";

/** A custom banner's action button (`action` is its label), or "Got it" on a generic one. */
export function BannerButtons({ id, action }: { id: string; action: string | null }) {
  const [pending, start] = useTransition();
  if (action)
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => toast.result(await takePageBannerAction(id)))}
        className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : action}
      </button>
    );
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await dismissPageBanner(id);
          if (!r.ok) toast.error(r.message);
        })
      }
      className="shrink-0 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/60 disabled:opacity-60"
    >
      {pending ? "…" : "Got it"}
    </button>
  );
}
