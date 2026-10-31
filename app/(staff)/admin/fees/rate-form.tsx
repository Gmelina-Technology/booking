"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/facility";
import { feeFor } from "@/lib/fees";
import { addFeeRate, type FeeResult } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

/** Adds a new platform rate or a partner promo, with a preview of what typical bookings would cost. */
export default function RateForm({
  owners,
  earliest,
  current,
}: {
  owners: { id: string; name: string }[];
  earliest: string;
  current: { ratePerHour: number; capPerBooking: number | null };
}) {
  const [scope, setScope] = useState<"platform" | "owner">("platform");
  const [rate, setRate] = useState(String(current.ratePerHour));
  const [cap, setCap] = useState(current.capPerBooking === null ? "" : String(current.capPerBooking));
  const [result, setResult] = useState<FeeResult | null>(null);
  const [saving, start] = useTransition();

  const preview = { ratePerHour: Number(rate) || 0, capPerBooking: cap.trim() === "" ? null : Number(cap) || 0 };

  function submit(form: FormData) {
    setResult(null);
    start(async () => setResult(await addFeeRate(form)));
  }

  return (
    <form action={submit} className="grid gap-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-4">
        <h2 className="font-semibold">Change a rate</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {(["platform", "owner"] as const).map((s) => (
            <label key={s} className={`cursor-pointer rounded-lg border px-3 py-1.5 ${scope === s ? "border-emerald-600 bg-emerald-50 font-medium" : "border-black/10"}`}>
              <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="sr-only" />
              {s === "platform" ? "Platform rate (everyone)" : "Promo for one partner"}
            </label>
          ))}
        </div>
        {scope === "owner" && (
          <label className="block text-sm">
            <span className="font-medium">Partner</span>
            <select name="ownerId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Pick a partner…
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Rate per booked hour (₱)</span>
            <input name="ratePerHour" type="number" min={0} step={1} required value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Max per booking (₱)</span>
            <input name="capPerBooking" type="number" min={0} step={1} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="No cap" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Starts on bookings from</span>
            <input name="effectiveFrom" type="date" min={earliest} defaultValue={earliest} required className={inputClass} />
          </label>
          {scope === "owner" && (
            <label className="block text-sm">
              <span className="font-medium">Ends after (optional)</span>
              <input name="until" type="date" min={earliest} className={inputClass} />
            </label>
          )}
        </div>
        <label className="block text-sm">
          <span className="font-medium">Note (optional)</span>
          <input name="note" maxLength={200} placeholder="e.g. Launch partner deal" className={inputClass} />
        </label>
        <p className="text-xs text-black/50">Changes start tomorrow at the earliest, so fees already charged never change.</p>
        {result && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {result.message}
          </p>
        )}
        <button type="submit" disabled={saving} className="rounded-xl bg-emerald-700 px-6 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {saving ? "Saving…" : "Save rate"}
        </button>
      </div>
      <aside className="rounded-xl bg-black/[0.03] p-4 text-sm">
        <p className="font-medium">Preview</p>
        <dl className="mt-2 space-y-1.5">
          {[1, 2, 3, 6].map((h) => (
            <div key={h} className="flex justify-between">
              <dt className="text-black/60">
                {h} hour{h > 1 ? "s" : ""}
              </dt>
              <dd className="font-semibold">{formatMoney(feeFor(preview, h))}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </form>
  );
}
