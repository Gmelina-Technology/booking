"use client";

import { useState, useTransition } from "react";
import type { BusinessProfile } from "@/lib/facility";
import { saveBusiness } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export default function BusinessForm({ profile }: { profile: BusinessProfile }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(form: FormData) {
    setResult(null);
    startSaving(async () => setResult(await saveBusiness(form)));
  }

  return (
    <form action={submit} className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Shown on your page and in emails</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" name="name" defaultValue={profile.name} required maxLength={80} />
        <Field label="Tagline" name="tagline" defaultValue={profile.tagline} maxLength={140} placeholder="Indoor courts in the heart of Makati" />
        <Field label="Address" name="address" defaultValue={profile.address} maxLength={200} placeholder="123 Rizal Avenue, Makati City" />
        <Field label="Phone" name="phone" defaultValue={profile.phone} maxLength={40} placeholder="+63 917 000 0000" />
        <Field
          label="Contact email"
          name="email"
          type="email"
          defaultValue={profile.email}
          maxLength={120}
          placeholder="hello@yourfacility.com"
        />
      </div>
      <p className="text-xs text-black/50">
        Customers see the phone (or email) when they need to change a booking. Replies to booking emails go to the contact email.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {result && (
          <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input {...props} className={inputClass} />
    </label>
  );
}
