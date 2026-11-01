"use client";

import { useTransition } from "react";
import type { BusinessProfile } from "@/lib/facility";
import { socialNetworks } from "@/lib/socials";
import { toast } from "@/app/toaster";
import { saveBusiness } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export default function BusinessForm({ profile }: { profile: BusinessProfile }) {
  const [saving, startSaving] = useTransition();

  // onSubmit rather than a form action, which would clear what the owner typed when saving fails.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSaving(async () => toast.result(await saveBusiness(form)));
  }

  return (
    <form
      // Remount after a save so the inputs show the saved values (handles become full links).
      key={JSON.stringify(profile)}
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm"
    >
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
      <fieldset className="border-t border-black/5 pt-4">
        <legend className="sr-only">Social media</legend>
        <h3 className="font-semibold">Social media</h3>
        <p className="mt-1 text-xs text-black/50">Paste your profile link or type your handle. Linked from your page. Leave blank to hide.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {socialNetworks.map((n) => (
            <Field
              key={n.key}
              label={n.label}
              name={`social-${n.key}`}
              defaultValue={profile.socials?.[n.key] ?? ""}
              maxLength={300}
              placeholder={n.profile("yourfacility").replace(/^https:\/\/(www\.)?/, "")}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
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
