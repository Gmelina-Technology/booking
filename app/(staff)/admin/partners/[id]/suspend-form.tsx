"use client";

import { useActionState, useState } from "react";
import { toast } from "@/app/toaster";
import { suspendPartner, type SuspendState } from "../actions";

/** Asks for the reason (the partner sees it) before taking their page offline. */
export default function SuspendForm({ ownerId, name }: { ownerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [, action, pending] = useActionState<SuspendState, FormData>(
    async (prev, form) => {
      const next = await suspendPartner(ownerId, prev, form);
      toast.error(next.error);
      return next;
    },
    { error: null },
  );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-400 hover:bg-red-50"
      >
        Suspend page…
      </button>
    );

  return (
    <form action={action} className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <p className="text-sm text-red-950">
        <strong>{name}</strong>&apos;s page goes offline and stops taking requests. They can still sign in and manage existing bookings. We email
        them the reason below.
      </p>
      <label className="block text-sm">
        <span className="font-medium">Reason</span>
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={300}
          rows={3}
          placeholder="e.g. Repeated reports of customers paying downpayments for slots that weren't honoured."
          className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {pending ? "Suspending…" : "Suspend page"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5">
          Cancel
        </button>
      </div>
    </form>
  );
}
