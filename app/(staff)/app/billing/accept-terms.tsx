"use client";

import { useTransition } from "react";
import { acceptFeeTerms } from "./actions";

/** For accounts created before fees: shows the rate and records their agreement. */
export function AcceptFeeTerms({ rate }: { rate: string }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Please review</p>
      <p className="mt-1 text-sm text-black/70">
        Partners pay {rate} for each booking that&apos;s confirmed and played. No monthly fees, and nothing for cancelled bookings.
      </p>
      <button
        disabled={pending}
        onClick={() => start(() => acceptFeeTerms())}
        className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "I agree"}
      </button>
    </div>
  );
}
