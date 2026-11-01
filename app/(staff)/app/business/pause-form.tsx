"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "@/app/toaster";
import { pausePage, resumePage } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export type PauseView = {
  message: string;
  until?: string;
  /** Dates formatted on the server, in facility time. */
  sinceLabel: string;
  untilLabel?: string;
};

/**
 * Lets the owner pause their own page for a while (a holiday, renovation) and
 * resume it. `min` and `max` bound the reopening date: tomorrow to a year ahead.
 */
export default function PauseForm({ pause, min, max, upcoming }: { pause: PauseView | null; min: string; max: string; upcoming: number }) {
  const [editing, setEditing] = useState(false);
  const [busy, start] = useTransition();

  // onSubmit rather than a form action, which would clear what the owner typed when saving fails.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const result = await pausePage(form);
      toast.result(result);
      if (result.ok) setEditing(false);
    });
  }

  function resume() {
    start(async () => toast.result(await resumePage()));
  }

  const bookingsNote =
    upcoming > 0 ? (
      <p className="text-black/60">
        Pausing doesn&apos;t change the {upcoming} upcoming booking{upcoming === 1 ? "" : "s"} you already have. Cancel any you can&apos;t
        honour from{" "}
        <Link href="/app/bookings" className="font-medium underline hover:text-black">
          Bookings
        </Link>
        , so those customers are told.
      </p>
    ) : null;

  const form = editing && (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-amber-950">
        Your page stays online with your message, but customers can&apos;t send new requests and it leaves the directory.
      </p>
      <label className="block">
        <span className="font-medium">Message for customers</span> <span className="text-black/50">(optional)</span>
        <textarea
          name="message"
          maxLength={300}
          rows={3}
          defaultValue={pause?.message}
          placeholder="e.g. We're closed for court resurfacing. See you soon!"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="font-medium">Reopen on</span> <span className="text-black/50">(optional)</span>
        <input type="date" name="until" min={min} max={max} defaultValue={pause?.until} className={`${inputClass} sm:w-56`} />
        <span className="mt-1 block text-xs text-black/50">
          Your page takes bookings again from this day. Leave it empty to resume it yourself.
        </span>
      </label>
      {!pause && bookingsNote}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : pause ? "Save changes" : "Pause page"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 font-medium text-black/60 hover:bg-black/5">
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section
      id="page-status"
      className={`scroll-mt-20 rounded-2xl border p-5 shadow-sm ${pause ? "border-amber-200 bg-amber-50/50" : "border-black/5 bg-white"}`}
    >
      <h2 className="font-semibold">Page status</h2>
      {pause ? (
        <div className="mt-2 space-y-3 text-sm">
          <p>
            <strong className="text-amber-800">Paused</strong> since {pause.sinceLabel}.{" "}
            {pause.untilLabel ? `It takes bookings again from ${pause.untilLabel}.` : "It stays paused until you resume it."} Customers can open
            your page but can&apos;t send new requests, and it&apos;s hidden from the directory.
          </p>
          <p className="rounded-lg bg-white/70 p-3 text-black/70">
            {pause.message ? <>Customers see: &ldquo;{pause.message}&rdquo;</> : "Customers see that you aren't taking bookings right now."}
          </p>
          {bookingsNote}
          {form || (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resume}
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "Resuming…" : "Resume bookings now"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 font-medium hover:bg-black/5"
              >
                Change message or date
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          <p>
            <strong className="text-emerald-800">Live.</strong> Listed in the directory and taking booking requests. Closing for a while?
            Pause your page instead of hiding every activity.
          </p>
          {form || (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-amber-300 px-3 py-2 font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-50"
            >
              Pause page…
            </button>
          )}
        </div>
      )}
    </section>
  );
}
