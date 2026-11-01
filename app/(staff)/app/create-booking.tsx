"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  createStaffBooking,
  editBooking,
  staffAvailability,
  type DayAvailability,
  type NewBookingKind,
  type StaffBookingInput,
} from "./booking-actions";
import { staffHref, type StaffQuery } from "./query";
import { formatHour, formatMoney, type Activity } from "@/lib/facility";
import { isPeakHour, priceFor } from "@/lib/schedule";
import type { Booking } from "@/lib/store-types";

export type BookableActivity = Pick<
  Activity,
  | "slug"
  | "name"
  | "resourceLabel"
  | "resources"
  | "openHour"
  | "closeHour"
  | "maxHoursPerBooking"
  | "maxPlayers"
  | "pricePerHour"
  | "peak"
  | "noDownpayment"
>;

const kinds: { key: NewBookingKind; label: string; hint: string }[] = [
  { key: "paid", label: "Paid in full", hint: "Walk-in who paid at the desk." },
  { key: "unpaid", label: "Confirmed, pays at the venue", hint: "Held for them; collect the total when they arrive." },
  { key: "tentative", label: "Tentative", hint: "A hold to approve later. Never released automatically." },
  { key: "block", label: "Block the court", hint: "No customer: maintenance, private use, a tournament." },
];

type Form = StaffBookingInput & { kind: NewBookingKind | ""; notify: boolean };

/** Where a click on an empty calendar slot asks the form to start: `slug~resourceId~hour` (see query.ts). */
function parseSlot(slot: string) {
  const [slug, resourceId, hour] = slot.split("~");
  return slug && resourceId && /^\d+$/.test(hour) ? { slug, resourceId, hour: Number(hour) } : null;
}

/** "Create Booking" button and its form, for walk-in and phone customers or blocking a court. */
export function CreateBooking({ activities, q, today, nowHour }: { activities: BookableActivity[]; q: StaffQuery; today: string; nowHour: number }) {
  const router = useRouter();
  const [opened, setOpened] = useState<Form | null>(null);
  const first = activities.find((a) => a.slug === q.activity) ?? activities[0];

  function blank(over: Partial<Form> = {}): Form {
    const date = q.mode === "table" || q.date >= today ? q.date : today;
    const activity = activities.find((a) => a.slug === over.activitySlug) ?? first;
    const earliest = date === today ? Math.max(nowHour, activity?.openHour ?? 8) : (activity?.openHour ?? 8);
    return {
      activitySlug: activity?.slug ?? "",
      resourceId: activity?.resources[0]?.id ?? "",
      date,
      startHour: Math.min(earliest, (activity?.closeHour ?? 24) - 1),
      hours: 1,
      name: "",
      phone: "",
      email: "",
      players: Math.min(2, activity?.maxPlayers ?? 2),
      notes: "",
      kind: "",
      notify: false,
      ...over,
    };
  }

  // A click on an empty slot in the day calendar opens the form there.
  const slot = parseSlot(q.slot);
  const slotKey = slot ? q.slot : "";
  const [handledSlot, setHandledSlot] = useState("");
  if (slotKey && slotKey !== handledSlot) {
    setHandledSlot(slotKey);
    if (slot && activities.some((a) => a.slug === slot.slug)) {
      setOpened(blank({ activitySlug: slot.slug, resourceId: slot.resourceId, startHour: slot.hour, date: q.date }));
    }
  }

  function close() {
    setOpened(null);
    if (q.slot) router.replace(staffHref(q, today, { slot: "" }), { scroll: false });
  }

  return (
    <>
      <button
        onClick={() => setOpened(blank())}
        disabled={activities.length === 0}
        title={activities.length === 0 ? "Add an activity first" : undefined}
        className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        <span className="flex size-6 items-center justify-center rounded-lg bg-white/15 text-base leading-none">+</span>
        Create Booking
      </button>
      {opened && (
        <BookingDialog
          key={`${opened.activitySlug}/${opened.resourceId}/${opened.date}/${opened.startHour}`}
          activities={activities}
          initial={opened}
          today={today}
          nowHour={nowHour}
          onClose={close}
          onSaved={(id, form) => {
            setOpened(null);
            // Show the new booking: its day in the calendar, with its details open.
            router.push(staffHref(q, today, { date: form.date, booking: id, slot: "", ...(q.mode === "table" ? { view: "schedule" } : {}) }), { scroll: false });
          }}
        />
      )}
    </>
  );
}

/** "Edit / reschedule" for an existing booking: move it, or fix the customer's details. */
export function EditBooking({ b, activities, today, nowHour }: { b: Booking; activities: BookableActivity[]; today: string; nowHour: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (b.status === "cancelled") return null;
  const initial: Form = {
    activitySlug: b.activitySlug,
    resourceId: b.resourceId,
    date: b.date,
    startHour: b.startHour,
    hours: b.hours,
    name: b.name,
    phone: b.phone,
    email: b.email,
    players: b.players,
    notes: b.notes,
    kind: b.blocked ? "block" : "paid",
    notify: !!b.email,
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium hover:border-emerald-600"
      >
        {b.blocked ? "Edit block" : "Edit / reschedule"}
      </button>
      {open && (
        <BookingDialog
          activities={activities}
          initial={initial}
          today={today}
          nowHour={nowHour}
          editing={b}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function BookingDialog({
  activities,
  initial,
  today,
  nowHour,
  editing,
  onClose,
  onSaved,
}: {
  activities: BookableActivity[];
  initial: Form;
  today: string;
  nowHour: number;
  /** The booking being edited; omitted when creating one. */
  editing?: Booking;
  onClose: () => void;
  onSaved: (id: string, form: Form) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Form>(initial);
  const [availability, setAvailability] = useState<DayAvailability | null>(null);
  const activity = activities.find((a) => a.slug === form.activitySlug);
  const set = (change: Partial<Form>) => setForm((f) => ({ ...f, ...change }));
  const block = form.kind === "block";

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Live availability for the chosen activity and day, so staff pick a free slot instead of guessing.
  useEffect(() => {
    let current = true;
    staffAvailability(form.activitySlug, form.date, editing?.id).then((a) => current && setAvailability(a));
    return () => {
      current = false;
    };
  }, [form.activitySlug, form.date, editing?.id]);

  function pickActivity(slug: string) {
    const a = activities.find((x) => x.slug === slug);
    if (!a) return;
    setAvailability(null);
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
    if (!editing && !form.kind) return setError("Choose how this booking starts.");
    start(async () => {
      if (editing) {
        const result = await editBooking(editing.id, form);
        if (!result.ok) return setError(result.message);
        setNotice(result.message);
        onSaved(editing.id, form);
        return;
      }
      const result = await createStaffBooking({ ...form, kind: form.kind as NewBookingKind });
      if (!result.ok || !result.id) return setError(result.message);
      onSaved(result.id, form);
    });
  }

  const booked = new Set(availability?.booked[form.resourceId] ?? []);
  const isPast = (h: number) => form.date < today || (form.date === today && h < nowHour);
  const startHours = activity ? Array.from({ length: activity.closeHour - activity.openHour }, (_, i) => activity.openHour + i) : [];
  const maxHours = activity ? activity.closeHour - form.startHour : 1;
  const slotHours = Array.from({ length: form.hours || 0 }, (_, i) => form.startHour + i);
  const clash = slotHours.some((h) => booked.has(h));
  const freeOn = (resourceId: string) => startHours.filter((h) => !isPast(h) && !(availability?.booked[resourceId] ?? []).includes(h)).length;
  const total = activity && !block ? priceFor(activity, form.date, form.startHour, form.hours || 0) : 0;
  const peak = activity && slotHours.some((h) => isPeakHour(activity, form.date, h));
  const moved =
    !!editing &&
    (editing.activitySlug !== form.activitySlug ||
      editing.resourceId !== form.resourceId ||
      editing.date !== form.date ||
      editing.startHour !== form.startHour ||
      editing.hours !== form.hours);

  const field = "mt-1 block w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";
  const label = "block text-xs font-medium text-black/60";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/30"
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <form onSubmit={submit} className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{editing ? `${block ? "Edit block" : "Edit booking"} ${editing.id}` : "Create booking"}</h2>
            <p className="text-sm text-black/50">
              {editing ? "Move it to another time or court, or fix the customer's details." : "For a walk-in or phone customer, or to block a court. No emails are sent."}
            </p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-2 py-1 text-black/40 hover:bg-black/5" aria-label="Close">
            ✕
          </button>
        </div>

        {!editing && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-medium text-black/60">How does it start?</legend>
            {kinds.map((k) => (
              <label
                key={k.key}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${form.kind === k.key ? "border-emerald-600 bg-emerald-50" : "border-black/10"}`}
              >
                <input type="radio" name="kind" className="mt-0.5 accent-emerald-700" checked={form.kind === k.key} onChange={() => set({ kind: k.key })} />
                <span>
                  <span className="block font-medium">{k.label}</span>
                  <span className="block text-xs text-black/50">{k.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

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
                  {availability ? ` (${freeOn(r.id)} hours free)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Date
            <input type="date" required min={editing && editing.date < today ? undefined : today} className={field} value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
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
                {startHours.map((h) => {
                  const taken = booked.has(h);
                  const past = isPast(h);
                  // The booking's own current start stays pickable, even once it's passed.
                  const own = editing && editing.date === form.date && editing.startHour === h;
                  return (
                    <option key={h} value={h} disabled={!own && (taken || past)}>
                      {formatHour(h)}
                      {taken ? " · booked" : past && !own ? " · past" : ""}
                    </option>
                  );
                })}
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
        </div>

        {availability?.closed && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Customers can&apos;t book this day ({availability.closed}). You can still add a booking here.
          </p>
        )}
        {clash && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Part of that time is already booked on this {activity?.resourceLabel.toLowerCase() ?? "court"}. Pick a free start or another one.</p>}
        {activity && form.hours > activity.maxHoursPerBooking && !block && (
          <p className="text-xs text-black/50">Longer than the {activity.maxHoursPerBooking}-hour limit customers have. That&apos;s fine for staff bookings.</p>
        )}

        {block ? (
          <label className={label}>
            Reason <span className="font-normal text-black/40">(shown on your calendar only)</span>
            <input className={field} value={form.name} placeholder="Maintenance, private event…" onChange={(e) => set({ name: e.target.value })} />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
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
        )}
        <label className={label}>
          Notes
          <textarea rows={2} className={field} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>

        {editing && moved && !block && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-emerald-700" checked={form.notify} disabled={!form.email} onChange={(e) => set({ notify: e.target.checked })} />
            Email the customer the new time{!form.email && " (no email on file)"}
          </label>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-4">
          <p className="text-sm text-black/60">
            {block ? (
              "No charge"
            ) : (
              <>
                Total <span className="font-semibold text-black">{formatMoney(total)}</span>
                {peak && <span className="ml-1 text-xs text-amber-700">incl. peak hours</span>}
                {editing && moved && editing.paidAt && <span className="block text-xs">Downpayment already received stays as it is.</span>}
              </>
            )}
          </p>
          <button
            type="submit"
            disabled={pending || clash}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? (moved ? "Move booking" : "Save changes") : block ? "Block court" : "Create booking"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
