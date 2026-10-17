"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { createBooking, getAvailability, type Availability } from "@/app/actions";
import { formatHour, formatHourRange, formatMoney, type Resource } from "@/lib/facility";
import { bookableDates, facilityNow, formatDate } from "@/lib/time";

type ActivityInfo = {
  slug: string;
  name: string;
  pricePerHour: number;
  openHour: number;
  closeHour: number;
  maxHoursPerBooking: number;
  maxPlayers: number;
  resourceLabel: string;
  resources: Resource[];
};

type Selection = { startHour: number; hours: number } | null;

const noopSubscribe = () => () => {};

export default function BookingWidget({ activity }: { activity: ActivityInfo }) {
  const router = useRouter();
  // Dates depend on the current time, so read "today" on the client only.
  const today = useSyncExternalStore(noopSubscribe, () => facilityNow().date, () => null);
  const dates = useMemo(() => (today ? bookableDates(today) : []), [today]);
  const [pickedDate, setDate] = useState<string | null>(null);
  const date = pickedDate ?? dates[0] ?? null;
  const [resourceId, setResourceId] = useState(activity.resources[0].id);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmitting] = useTransition();

  const load = useCallback(
    (d: string) =>
      startLoading(async () => {
        setAvailability(await getAvailability(activity.slug, d));
      }),
    [activity.slug],
  );

  useEffect(() => {
    if (date) load(date);
  }, [date, load]);

  const hours = Array.from({ length: activity.closeHour - activity.openHour }, (_, i) => activity.openHour + i);
  const isFree = (rid: string, h: number) =>
    !!availability &&
    availability.date === date &&
    !(availability.booked[rid] ?? []).includes(h) &&
    (availability.currentHour === null || h > availability.currentHour);
  const freeCount = (rid: string) => hours.filter((h) => isFree(rid, h)).length;

  function pickDate(d: string) {
    setDate(d);
    setSelection(null);
    setError(null);
  }

  function pickResource(id: string) {
    setResourceId(id);
    setSelection(null);
    setError(null);
  }

  function pickHour(h: number) {
    setError(null);
    if (selection) {
      const end = selection.startHour + selection.hours;
      if (h === selection.startHour) return setSelection(null);
      if (h > selection.startHour && h < end) return setSelection({ startHour: selection.startHour, hours: h - selection.startHour + 1 });
      if (h === end && selection.hours < activity.maxHoursPerBooking) return setSelection({ ...selection, hours: selection.hours + 1 });
    }
    setSelection({ startHour: h, hours: 1 });
  }

  function submit(form: FormData) {
    if (!selection || !date) return;
    startSubmitting(async () => {
      const result = await createBooking({
        activitySlug: activity.slug,
        resourceId,
        date,
        startHour: selection.startHour,
        hours: selection.hours,
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        players: Number(form.get("players") ?? 1),
        notes: String(form.get("notes") ?? ""),
      });
      if (result.ok) {
        router.push(`/bookings/${result.id}`);
      } else {
        setError(result.error);
        load(date);
      }
    });
  }

  const resource = activity.resources.find((r) => r.id === resourceId)!;
  const canExtend =
    selection &&
    selection.hours < activity.maxHoursPerBooking &&
    isFree(resourceId, selection.startHour + selection.hours) &&
    selection.startHour + selection.hours < activity.closeHour;

  return (
    <div className="min-w-0 space-y-6">
      <Step n={1} title="Pick a date">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {dates.length === 0
            ? Array.from({ length: 7 }, (_, i) => <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-black/5" />)
            : dates.map((d, i) => {
                const active = d === date;
                return (
                  <button
                    key={d}
                    onClick={() => pickDate(d)}
                    className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-sm transition ${
                      active ? "border-emerald-700 bg-emerald-700 text-white" : "border-black/10 bg-white hover:border-emerald-600"
                    }`}
                  >
                    <span className={`text-xs ${active ? "text-white/80" : "text-black/50"}`}>
                      {i === 0 ? "Today" : formatDate(d, { weekday: "short", month: undefined, day: undefined })}
                    </span>
                    <span className="text-lg font-semibold">{formatDate(d, { weekday: undefined, month: undefined })}</span>
                    <span className={`text-[10px] uppercase ${active ? "text-white/70" : "text-black/40"}`}>
                      {formatDate(d, { weekday: undefined, day: undefined })}
                    </span>
                  </button>
                );
              })}
        </div>
      </Step>

      <Step n={2} title={`Choose a ${activity.resourceLabel.toLowerCase()}`}>
        <div className="flex flex-wrap gap-2">
          {activity.resources.map((r) => {
            const active = r.id === resourceId;
            const free = availability ? freeCount(r.id) : null;
            return (
              <button
                key={r.id}
                onClick={() => pickResource(r.id)}
                className={`rounded-xl border px-4 py-2 text-left text-sm transition ${
                  active ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700" : "border-black/10 bg-white hover:border-emerald-600"
                }`}
              >
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-xs text-black/50">
                  {free === null || loading ? "…" : free === 0 ? "Fully booked" : `${free} slot${free === 1 ? "" : "s"} free`}
                </span>
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={3} title="Select your time">
        <p className="-mt-2 mb-3 text-sm text-black/50">
          Tap a start time, then tap the next slots to extend (up to {activity.maxHoursPerBooking} hours).
        </p>
        <div className={`grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 ${loading ? "opacity-50" : ""}`}>
          {hours.map((h) => {
            const free = isFree(resourceId, h);
            const selected = selection && h >= selection.startHour && h < selection.startHour + selection.hours;
            return (
              <button
                key={h}
                disabled={!free || loading}
                onClick={() => pickHour(h)}
                className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                  selected
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : free
                      ? "border-black/10 bg-white hover:border-emerald-600 hover:bg-emerald-50"
                      : "cursor-not-allowed border-transparent bg-black/[0.04] text-black/30 line-through"
                }`}
              >
                {formatHour(h)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-black/50">
          <Legend className="border border-black/10 bg-white" label="Available" />
          <Legend className="bg-emerald-700" label="Selected" />
          <Legend className="bg-black/10" label="Booked / past" />
        </div>
      </Step>

      <Step n={4} title="Your details">
        {selection && date ? (
          <form action={submit} className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-emerald-900">
                    {activity.name} · {resource.name}
                  </p>
                  <p className="text-emerald-900/70">
                    {formatDate(date, { weekday: "long", month: "long" })} · {formatHourRange(selection.startHour, selection.hours)}
                  </p>
                </div>
                <p className="text-xl font-bold text-emerald-900">{formatMoney(activity.pricePerHour * selection.hours)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-emerald-900/70">Duration:</span>
                <button
                  type="button"
                  disabled={selection.hours <= 1}
                  onClick={() => setSelection({ ...selection, hours: selection.hours - 1 })}
                  className="h-7 w-7 rounded-md border border-emerald-700/30 bg-white font-bold disabled:opacity-30"
                  aria-label="Shorter"
                >
                  −
                </button>
                <span className="w-14 text-center font-semibold">
                  {selection.hours} hr{selection.hours > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  disabled={!canExtend}
                  onClick={() => setSelection({ ...selection, hours: selection.hours + 1 })}
                  className="h-7 w-7 rounded-md border border-emerald-700/30 bg-white font-bold disabled:opacity-30"
                  aria-label="Longer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="name" autoComplete="name" required />
              <Field label="Email" name="email" type="email" autoComplete="email" required />
              <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" required />
              <Field
                label="Number of players"
                name="players"
                type="number"
                min={1}
                max={activity.maxPlayers}
                defaultValue={Math.min(4, activity.maxPlayers)}
                required
              />
            </div>
            <label className="block text-sm">
              <span className="font-medium">Notes (optional)</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Equipment rental, coach request…"
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </label>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {submitting ? "Booking…" : `Confirm booking · ${formatMoney(activity.pricePerHour * selection.hours)}`}
            </button>
            <p className="text-center text-xs text-black/50">Pay at the front desk on arrival.</p>
          </form>
        ) : (
          <>
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <p className="text-sm text-black/50">Select a time slot above to continue.</p>
          </>
        )}
      </Step>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-3 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lime-200 text-sm text-emerald-900">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
    </label>
  );
}
