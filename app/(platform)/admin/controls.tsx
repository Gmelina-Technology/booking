"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  approveBooking,
  cancelBooking,
  eraseCustomerDetails,
  markDownpaymentReceived,
  resendPaymentEmail,
  type StaffResult,
} from "./booking-actions";
import { adminHref, type AdminQuery, type Mode } from "./query";
import { addDays, formatDate } from "@/lib/time";

/** Space filter, past/cancelled toggles and the calendar/table switch. Every change is kept in the URL. */
export function Toolbar({ q, today, activities }: { q: AdminQuery; today: string; activities: { slug: string; name: string }[] }) {
  const router = useRouter();
  const go = (changes: Partial<AdminQuery>) => router.push(adminHref(q, today, changes), { scroll: false });
  const isTable = q.mode === "table";
  const check = "size-4 rounded border-black/20 accent-emerald-700";

  return (
    <div className="mt-6 flex flex-wrap items-end gap-x-5 gap-y-2">
      {/* Phones get space chips inside the calendar instead. */}
      <label className={isTable ? "block" : "hidden md:block"}>
        <span className="mb-1 block text-xs font-medium text-black/50">Space</span>
        <select
          value={q.activity}
          onChange={(e) => go({ activity: e.target.value })}
          className="w-48 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
        >
          <option value="">All spaces</option>
          {activities.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 py-2 text-sm text-black/70">
        <input type="checkbox" className={check} checked={q.past} onChange={(e) => go({ past: e.target.checked })} />
        Show past bookings
      </label>
      {!isTable && (
        <label className="flex items-center gap-2 py-2 text-sm text-black/70">
          <input type="checkbox" className={check} checked={q.cancelled} onChange={(e) => go({ cancelled: e.target.checked })} />
          Show cancelled
        </label>
      )}
      <Link
        href={adminHref(q, today, isTable ? { mode: "month" } : { mode: "table", view: "schedule" })}
        scroll={false}
        className="ml-auto flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:border-emerald-600"
      >
        <span aria-hidden>⇄</span> {isTable ? "Switch to calendar" : "Switch to table view"}
      </Link>
    </div>
  );
}

/** Month / Week / Day selector on the calendar card. */
export function ModeSelect({ q, today }: { q: AdminQuery; today: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Calendar view"
      value={q.mode}
      onChange={(e) => router.push(adminHref(q, today, { mode: e.target.value as Mode }), { scroll: false })}
      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium"
    >
      <option value="month">Month view</option>
      <option value="week">Week view</option>
      <option value="day">Day view</option>
    </select>
  );
}

/** Day picker for the table's Schedule tab. */
export function DayPicker({ q, today }: { q: AdminQuery; today: string }) {
  const router = useRouter();
  const go = (date: string) => router.push(adminHref(q, today, { date }), { scroll: false });
  const btn = "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:border-emerald-600";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button className={btn} onClick={() => go(addDays(q.date, -1))} aria-label="Previous day">
        ←
      </button>
      <input
        type="date"
        value={q.date}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      />
      <button className={btn} onClick={() => go(addDays(q.date, 1))} aria-label="Next day">
        →
      </button>
      {q.date !== today && (
        <button className={btn} onClick={() => go(today)}>
          Today
        </button>
      )}
      <span className="mx-2 hidden text-sm text-black/50 sm:inline">
        {formatDate(q.date, { weekday: "long", month: "long", year: "numeric" })}
      </span>
    </div>
  );
}

type Status = "pending" | "awaiting_payment" | "confirmed" | "cancelled";

/** Next-step buttons for a booking, depending on where it is in the lifecycle. */
export function BookingActions({ id, status }: { id: string; status: Status }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);

  function run(action: () => Promise<StaffResult>) {
    setResult(null);
    start(async () => setResult(await action()));
  }

  function cancel(verb: string) {
    const reason = prompt(`${verb} booking ${id}? The customer will be emailed and the slot released.

Reason (optional, included in the email):`);
    if (reason === null) return;
    run(() => cancelBooking(id, reason));
  }

  const primary = "rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
  const danger = "rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        {status === "pending" && (
          <>
            <button className={primary} disabled={pending} onClick={() => run(() => approveBooking(id))} title="Approve and email the customer the payment QR">
              Approve &amp; send QR
            </button>
            <button className={danger} disabled={pending} onClick={() => cancel("Decline")}>
              Decline
            </button>
          </>
        )}
        {status === "awaiting_payment" && (
          <>
            <button
              className={primary}
              disabled={pending}
              onClick={() => confirm(`Mark the downpayment for ${id} as received? The customer gets a confirmation email.`) && run(() => markDownpaymentReceived(id))}
            >
              Downpayment received
            </button>
            <MoreMenu
              disabled={pending}
              items={[
                { label: "Resend payment email", onSelect: () => run(() => resendPaymentEmail(id)) },
                { label: "Cancel booking", onSelect: () => cancel("Cancel"), danger: true },
              ]}
            />
          </>
        )}
        {status === "confirmed" && <MoreMenu disabled={pending} items={[{ label: "Cancel booking", onSelect: () => cancel("Cancel"), danger: true }]} />}
      </div>
      {pending && <p className="text-xs text-black/50">Working…</p>}
      {result && <p className={`max-w-xs text-right text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </div>
  );
}

/** Erases a finished booking's customer details, e.g. when the customer asks (Data Privacy Act). */
export function EraseCustomerButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);

  function erase() {
    if (!confirm(`Erase the customer's name, email, phone, notes and payment reference from ${id}? The booking itself stays. This can't be undone.`))
      return;
    setResult(null);
    start(async () => setResult(await eraseCustomerDetails(id)));
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={erase}
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Erasing…" : "Erase customer details"}
      </button>
      {result && <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </div>
  );
}

type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

/** "⋯" button with a small dropdown for the less common actions. Closes on outside click or Escape. */
function MoreMenu({ items, disabled }: { items: MenuItem[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-bold leading-none text-black/60 hover:border-emerald-600 hover:text-black disabled:opacity-50"
        disabled={disabled}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block py-0.5">⋯</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-black/10 bg-white py-1 text-left shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`block w-full px-3 py-2 text-left text-xs font-medium hover:bg-black/5 ${item.danger ? "text-red-700" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
