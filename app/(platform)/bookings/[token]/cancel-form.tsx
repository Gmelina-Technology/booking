"use client";

import { useState, useTransition } from "react";
import { cancelOwnBooking } from "@/app/actions";
import { toast } from "@/app/toaster";

/** "Cancel this booking" on the customer's private booking page, with a confirm step. */
export default function CancelForm({ token, paid, registration = false }: { token: string; paid: boolean; registration?: boolean }) {
  const what = registration ? "registration" : "booking";
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-700 hover:underline">
        Cancel this {what}
      </button>
    );
  }

  return (
    <form
      action={(form) => {
        start(async () => {
          const result = await cancelOwnBooking(token, String(form.get("reason") ?? ""));
          if (!result.ok) toast.error(result.error ?? "Something went wrong.");
        });
      }}
      className="mx-auto max-w-sm space-y-3 rounded-xl border border-red-200 bg-white p-4 text-left"
    >
      <p className="text-sm font-semibold text-black">Cancel this {what}?</p>
      <p className="text-sm text-black/60">
        {registration ? "Your spot is released for other players." : "The slot is released for other players."}
        {paid && ` Your ${registration ? "payment" : "downpayment"} is refunded according to the business's policy, so contact them about it.`}
      </p>
      <label className="block text-sm">
        <span className="text-black/60">Reason (optional, shared with the business)</span>
        <input name="reason" maxLength={300} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-black" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-black">
          Keep it
        </button>
      </div>
    </form>
  );
}
