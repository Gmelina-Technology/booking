"use client";

import { useState, useTransition } from "react";
import { submitPaymentReference } from "@/app/actions";

export default function PaymentReferenceForm({ token, submitted }: { token: string; submitted: string | null }) {
  const [editing, setEditing] = useState(!submitted);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing && submitted) {
    return (
      <div className="mx-auto mt-5 max-w-sm rounded-xl bg-white p-4 text-sm">
        <p className="font-semibold text-emerald-800">Thanks! We got your payment reference.</p>
        <p className="mt-1 text-black/60">
          Ref <span className="font-mono font-semibold text-black">{submitted}</span>. Staff will check it and email your
          confirmation.
        </p>
        <button onClick={() => setEditing(true)} className="mt-2 text-xs text-black/50 underline">
          Entered it wrong? Change it
        </button>
      </div>
    );
  }

  return (
    <form
      action={(form) => {
        setError(null);
        start(async () => {
          const result = await submitPaymentReference(token, String(form.get("reference") ?? ""));
          if (result.ok) setEditing(false);
          else setError(result.error ?? "Something went wrong.");
        });
      }}
      className="mx-auto mt-5 max-w-sm rounded-xl bg-white p-4 text-left"
    >
      <label className="block text-sm">
        <span className="font-medium">Already paid? Enter the reference number</span>
        <input
          name="reference"
          required
          defaultValue={submitted ?? ""}
          placeholder="e.g. 1009 876 543210"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-mono outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "I've paid: send reference"}
      </button>
    </form>
  );
}
