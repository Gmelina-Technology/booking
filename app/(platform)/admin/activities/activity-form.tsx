"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatHour, gradients, type Activity, type Resource } from "@/lib/facility";
import { saveActivity, type ActivityInput } from "./actions";

const blank: ActivityInput = {
  name: "",
  tagline: "",
  description: "",
  emoji: "🎯",
  gradient: gradients[0].className,
  active: true,
  pricePerHour: 300,
  openHour: 8,
  closeHour: 22,
  maxHoursPerBooking: 2,
  maxPlayers: 4,
  resourceLabel: "Court",
  resources: [{ id: "", name: "Court 1" }],
  includes: [],
};

const emojiChoices = ["🏓", "🏸", "🎾", "🏀", "⚽", "🏐", "🏊", "🎳", "🥊", "🧗", "⛳", "🏋️", "🧘", "🎯", "🏒", "🛼"];
const hourOptions = Array.from({ length: 25 }, (_, h) => h);

export default function ActivityForm({ activity }: { activity?: Activity }) {
  const router = useRouter();
  const [form, setForm] = useState<ActivityInput>(activity ?? blank);
  const [includesText, setIncludesText] = useState(form.includes.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const set = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function setResource(i: number, patch: Partial<Resource>) {
    set("resources", form.resources.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addResource() {
    set("resources", [...form.resources, { id: "", name: `${form.resourceLabel || "Court"} ${form.resources.length + 1}` }]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSaving(async () => {
      const result = await saveActivity(activity?.slug ?? null, {
        ...form,
        includes: includesText.split("\n"),
      });
      if (result.ok) router.push("/admin/activities");
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6">
        <Card title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(v) => set("name", v)} required placeholder="e.g. Pickleball" />
            <Field label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} placeholder="One short line" />
          </div>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className={inputClass}
            />
          </label>
          <div className="mt-4">
            <span className="text-sm font-medium">Icon</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {emojiChoices.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => set("emoji", e)}
                  className={`grid h-10 w-10 place-items-center rounded-lg border text-xl ${
                    form.emoji === e ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700" : "border-black/10 bg-white"
                  }`}
                >
                  {e}
                </button>
              ))}
              <input
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                aria-label="Custom emoji"
                className="h-10 w-16 rounded-lg border border-black/10 text-center text-xl"
              />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium">Card colour</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {gradients.map((g) => (
                <button
                  key={g.className}
                  type="button"
                  title={g.name}
                  aria-label={g.name}
                  onClick={() => set("gradient", g.className)}
                  className={`h-9 w-9 rounded-full bg-gradient-to-br ${g.className} ${
                    form.gradient === g.className ? "ring-2 ring-emerald-700 ring-offset-2" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card title="Pricing & hours">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Price per hour (₱)" value={form.pricePerHour} min={0} onChange={(v) => set("pricePerHour", v)} />
            <NumberField label="Max players" value={form.maxPlayers} min={1} onChange={(v) => set("maxPlayers", v)} />
            <HourSelect label="Opens" value={form.openHour} onChange={(v) => set("openHour", v)} hours={hourOptions.slice(0, 24)} />
            <HourSelect label="Closes" value={form.closeHour} onChange={(v) => set("closeHour", v)} hours={hourOptions.slice(1)} />
            <NumberField
              label="Max hours per booking"
              value={form.maxHoursPerBooking}
              min={1}
              max={24}
              onChange={(v) => set("maxHoursPerBooking", v)}
            />
          </div>
        </Card>

        <Card title="Courts">
          <div className="max-w-xs">
            <Field
              label="What are they called?"
              value={form.resourceLabel}
              onChange={(v) => set("resourceLabel", v)}
              placeholder="Court, Table, Lane…"
            />
          </div>
          <ul className="mt-4 space-y-2">
            {form.resources.map((r, i) => (
              <li key={r.id || `new-${i}`} className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => setResource(i, { name: e.target.value })}
                  aria-label={`Name of ${form.resourceLabel.toLowerCase()} ${i + 1}`}
                  className={`${inputClass} mt-0`}
                />
                {!r.id && <span className="shrink-0 text-xs text-emerald-700">New</span>}
                <button
                  type="button"
                  disabled={form.resources.length === 1}
                  onClick={() => set("resources", form.resources.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-30"
                  aria-label={`Remove ${r.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addResource}
            className="mt-3 rounded-lg border border-dashed border-black/20 px-4 py-2 text-sm font-medium hover:border-emerald-600"
          >
            + Add {form.resourceLabel.toLowerCase() || "court"}
          </button>
        </Card>

        <Card title="What's included">
          <label className="block text-sm">
            <span className="text-black/60">One item per line. Shown on the booking page.</span>
            <textarea value={includesText} onChange={(e) => setIncludesText(e.target.value)} rows={4} className={inputClass} />
          </label>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${form.gradient} text-5xl`}>{form.emoji}</div>
          <div className="p-4">
            <p className="font-semibold">{form.name || "Activity name"}</p>
            <p className="text-sm text-black/60">{form.tagline || "Tagline"}</p>
            <p className="mt-2 text-xs text-black/50">
              ₱{form.pricePerHour}/hr · {formatHour(form.openHour)}–{formatHour(form.closeHour)}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white p-4 text-sm shadow-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-700"
          />
          <span>
            <span className="font-medium">Open for booking</span>
            <span className="block text-black/50">Untick to hide it from customers. Existing bookings are kept.</span>
          </span>
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : activity ? "Save changes" : "Create activity"}
        </button>
        <Link href="/admin/activities" className="block text-center text-sm text-black/60 hover:underline">
          Cancel
        </Link>
      </aside>
    </form>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  ...props
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input {...props} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        required
        className={inputClass}
      />
    </label>
  );
}

function HourSelect({ label, value, onChange, hours }: { label: string; value: number; onChange: (v: number) => void; hours: number[] }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass}>
        {hours.map((h) => (
          <option key={h} value={h}>
            {h === 24 ? "Midnight" : formatHour(h)}
          </option>
        ))}
      </select>
    </label>
  );
}
