"use client";

import { useState, useTransition } from "react";
import { submitPaymentReference } from "@/app/actions";
import { resizeImage } from "@/lib/resize-image";
import { toast } from "@/app/toaster";

export default function PaymentReferenceForm({ token, submitted, due }: { token: string; submitted: string | null; due: number }) {
  const [editing, setEditing] = useState(!submitted);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [pending, start] = useTransition();

  async function pickReceipt(file: File | undefined) {
    if (!file) return setReceipt(null);
    try {
      setReceipt(await resizeImage(file, { maxEdge: 1400 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  }

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
        form.delete("receiptPicker");
        if (receipt) form.set("receipt", receipt);
        start(async () => {
          const result = await submitPaymentReference(token, form);
          if (result.ok) setEditing(false);
          else toast.error(result.error ?? "Something went wrong.");
        });
      }}
      className="mx-auto mt-5 max-w-sm space-y-3 rounded-xl bg-white p-4 text-left"
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
      <label className="block text-sm">
        <span className="font-medium">Amount you paid</span>
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={due}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">
          Receipt screenshot <span className="font-normal text-black/50">(optional, helps staff confirm faster)</span>
        </span>
        <input
          name="receiptPicker"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => pickReceipt(e.target.files?.[0])}
          className="mt-1 block w-full text-xs text-black/60 file:mr-3 file:rounded-lg file:border-0 file:bg-black/5 file:px-3 file:py-2 file:text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "I've paid: send reference"}
      </button>
    </form>
  );
}
