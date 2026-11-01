"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createStaffBooking, type NewStaffBooking } from "./booking-actions";
import { staffHref, type StaffQuery } from "./query";
import { formatHour, formatMoney, type Activity } from "@/lib/facility";

export type BookableActivity = Pick<
  Activity,
  "slug" | "name" | "resourceLabel" | "resources" | "openHour" | "closeHour" | "maxHoursPerBooking" | "maxPlayers" | "pricePerHour"
>;

/** "Create Booking" button and its form, for walk-in and phone customers. */
export function CreateBooking({ activities, q, today }: { activities: BookableActivity[]; q: StaffQuery; today: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const first = activities.find((a) => a.slug === q.activity) ?? activities[0];
  const blank = () => ({
    activitySlug: first?.slug ?? "",
    resourceId: first?.resources[0]?.id ?? "",
    date: q.mode === "table" || q.date >= today ? q.date : today,
    startHour: first?.openHour ?? 8,
    hours: 1,
    name: "",
    phone: "",
    email: "",
    players: 2,
    notes: "",
    status: "confirmed" as NewStaffBooking["status"],
  });
  const [form, setForm] = useState<NewStaffBooking>(blank);
  const activity = activities.find((a) => a.slug === form.activitySlug);
  const set = (change: Partial<NewStaffBooking>) => setForm((f) => ({ ...f, ...change }));

  function open() {
    setForm(blank());
    setError("");
    dialog.current?.showModal();
  }

  function pickActivity(slug: string) {
    const a = activities.find((x) => x.slug === slug);
    if (!a) return;
    set({
      activitySlug: slug,
      resourceId: a.resources[0]?.id ?? "",
      startHour: Math.min(Math.max(form.startHour, a.openHour), a.closeHour - 1),
      hours: 1,
      players: Math.min(form.players, a.maxPlayers),
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const result = await createStaffBooking(form);
      if (!result.ok || !result.id) return setError(result.message);
      dialog.current?.close();
      // Show the new booking: its day in the calendar, with its details open.
      router.push(staffHref(q, today, { date: form.date, booking: result.id, ...(q.mode === "table" ? { view: "schedule" } : {}) }), {
        scroll: false,
      });
    });
  }

  const field = "mt-1 block w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";
  const label = "block text-xs font-medium text-black/60";
  const startHours = activity ? Array.from({ length: activity.closeHour - activity.openHour }, (_, i) => activity.openHour + i) : [];
  const maxHours = activity ? activity.closeHour - form.startHour : 1;

  return (
    <>
      <button
        onClick={open}
        disabled={activities.length === 0}
        title={activities.length === 0 ? "Add an activity first" : undefined}
        className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        <span className="flex size-6 items-center justify-center rounded-lg bg-white/15 text-base leading-none">+</span>
        Create Booking
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/30"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Create booking</h2>
              <p className="text-sm text-black/50">For a walk-in or phone customer. No emails are sent.</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-2 py-1 text-black/40 hover:bg-black/5" aria-label="Close">
              ✕
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Activity
              <select className={field} value={form.activitySlug} onChange={(e) => pickActivity(e.target.value)}>
                {activities.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {activity?.resourceLabel ?? "Court"}
              <select className={field} value={form.resourceId} onChange={(e) => set({ resourceId: e.target.value })}>
                {activity?.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Date
              <input type="date" required className={field} value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Start
                <select
                  className={field}
                  value={form.startHour}
                  onChange={(e) => {
                    const startHour = Number(e.target.value);
                    set({ startHour, hours: Math.min(form.hours, (activity?.closeHour ?? 24) - startHour) });
                  }}
                >
                  {startHours.map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Hours
                <input
                  type="number"
                  required
                  min={1}
                  max={maxHours}
                  className={field}
                  value={form.hours}
                  onChange={(e) => set({ hours: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className={label}>
              Customer name
              <input required minLength={2} className={field} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className={label}>
              Phone
              <input type="tel" className={field} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </label>
            <label className={label}>
              Email <span className="font-normal text-black/40">(optional)</span>
              <input type="email" className={field} value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </label>
            <label className={label}>
              Players
              <input
                type="number"
                required
                min={1}
                max={activity?.maxPlayers}
                className={field}
                value={form.players}
                onChange={(e) => set({ players: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className={label}>
            Notes
            <textarea rows={2} className={field} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <legend className="mb-1 text-xs font-medium text-black/60">Status</legend>
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-emerald-700" checked={form.status === "confirmed"} onChange={() => set({ status: "confirmed" })} />
              Confirmed (paid)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-emerald-700" checked={form.status === "pending"} onChange={() => set({ status: "pending" })} />
              Tentative (to approve later)
            </label>
          </fieldset>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-4">
            <p className="text-sm text-black/60">
              Total <span className="font-semibold text-black">{formatMoney((activity?.pricePerHour ?? 0) * (form.hours || 0))}</span>
            </p>
            <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {pending ? "Saving…" : "Create booking"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
