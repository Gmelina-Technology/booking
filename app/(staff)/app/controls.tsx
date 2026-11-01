"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  approveBooking,
  approveBookings,
  cancelBooking,
  eraseCustomerDetails,
  markBalancePaid,
  markDownpaymentReceived,
  markNoShow,
  rejectPaymentReference,
  resendPaymentEmail,
  type StaffResult,
} from "./booking-actions";
import { useDialog } from "../dialog";
import { sectionOf, staffHref, type StaffQuery, type Mode } from "./query";
import type { Booking } from "@/lib/store-types";
import { addDays, facilityNow, formatDate } from "@/lib/time";

/** Search, space filter and past/cancelled toggles. Every change is kept in the URL. */
export function Toolbar({ q, today, activities }: { q: StaffQuery; today: string; activities: { slug: string; name: string }[] }) {
  const router = useRouter();
  const go = (changes: Partial<StaffQuery>) => router.push(staffHref(q, today, changes), { scroll: false });
  const isTable = q.mode === "table";
  const check = "size-4 rounded border-black/20 accent-emerald-700";

  return (
    <div className="mt-6 flex flex-wrap items-end gap-x-5 gap-y-2">
      {isTable && (
        <form
          role="search"
          className="w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            const search = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            // A search looks through every booking, so it lands on the All tab across all dates.
            go(search ? { search, view: q.view === "schedule" ? "all" : q.view } : { search: "" });
          }}
        >
          <span className="mb-1 block text-xs font-medium text-black/50">Search</span>
          <div className="flex gap-1.5">
            <input
              key={q.search}
              name="q"
              type="search"
              defaultValue={q.search}
              placeholder="Name, phone, email or reference"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
            {q.search && (
              <button type="button" onClick={() => go({ search: "" })} className="rounded-lg border border-black/10 bg-white px-2 text-xs text-black/60 hover:text-black">
                Clear
              </button>
            )}
          </div>
        </form>
      )}
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
      {/* The inbox always shows every date. */}
      {sectionOf(q) !== "inbox" && (
        <label className="flex items-center gap-2 py-2 text-sm text-black/70">
          <input type="checkbox" className={check} checked={q.past} onChange={(e) => go({ past: e.target.checked })} />
          Show past bookings
        </label>
      )}
      {!isTable && (
        <label className="flex items-center gap-2 py-2 text-sm text-black/70">
          <input type="checkbox" className={check} checked={q.cancelled} onChange={(e) => go({ cancelled: e.target.checked })} />
          Show cancelled
        </label>
      )}
    </div>
  );
}

/** Month / Week / Day selector on the calendar card. */
export function ModeSelect({ q, today }: { q: StaffQuery; today: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Calendar view"
      value={q.mode}
      onChange={(e) => router.push(staffHref(q, today, { mode: e.target.value as Mode }), { scroll: false })}
      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium"
    >
      <option value="month">Month view</option>
      <option value="week">Week view</option>
      <option value="day">Day view</option>
    </select>
  );
}

/** Day picker for the table's Schedule tab. */
export function DayPicker({ q, today }: { q: StaffQuery; today: string }) {
  const router = useRouter();
  const go = (date: string) => router.push(staffHref(q, today, { date }), { scroll: false });
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

/** "Approve all N" on the New requests tab, for a busy morning's requests. */
export function ApproveAll({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);
  const { confirm } = useDialog();
  if (ids.length < 2 && !result) return null;

  async function approve() {
    const ok = await confirm("Each customer gets their payment QR (or confirmation, for activities with no downpayment) by email.", {
      title: `Approve all ${ids.length} requests?`,
      confirmLabel: `Approve ${ids.length}`,
    });
    if (!ok) return;
    setResult(null);
    start(async () => setResult(await approveBookings(ids)));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {ids.length >= 2 && (
        <button
          onClick={approve}
          disabled={pending}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Approving…" : `Approve all ${ids.length}`}
        </button>
      )}
      {result && <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </div>
  );
}

/** What the action buttons need to know about a booking. */
export type ActionBooking = Pick<
  Booking,
  "id" | "status" | "email" | "date" | "startHour" | "paymentRef" | "blocked" | "balancePaidAt" | "noShowAt" | "downpayment" | "total"
>;

/** Next-step buttons for a booking, depending on where it is in the lifecycle. */
export function BookingActions({ b, today, noDownpayment = false }: { b: ActionBooking; today: string; noDownpayment?: boolean }) {
  const { id, status } = b;
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);
  const { confirm, prompt } = useDialog();
  const emailed = !!b.email;

  function run(action: () => Promise<StaffResult>) {
    setResult(null);
    start(async () => setResult(await action()));
  }

  async function cancel(verb: string) {
    if (b.blocked) {
      if (await confirm("The court is free for customers again.", { title: `Remove this block?`, confirmLabel: "Remove block" })) run(() => cancelBooking(id, ""));
      return;
    }
    const reason = await prompt(emailed ? "The customer will be emailed and the slot released." : "The slot is released. There's no email on file, so let the customer know yourself.", {
      title: `${verb} booking ${id}?`,
      label: emailed ? "Reason (optional, included in the email)" : "Reason (optional, for your records)",
      confirmLabel: `${verb} booking`,
      cancelLabel: "Keep booking",
      danger: true,
    });
    if (reason === null) return;
    run(() => cancelBooking(id, reason));
  }

  async function markReceived() {
    const ok = await confirm(emailed ? "The customer gets a confirmation email." : "There's no email on file, so no email is sent.", {
      title: `Mark the downpayment for ${id} as received?`,
      confirmLabel: "Mark received",
    });
    if (ok) run(() => markDownpaymentReceived(id));
  }

  async function notFound() {
    const note = await prompt("We clear the reference, give them a fresh payment window and email them to check their payment and enter it again.", {
      title: `Can't find the payment for ${id}?`,
      label: "Note to the customer (optional)",
      placeholder: "e.g. The amount was ₱200 short",
      confirmLabel: "Ask them to check",
    });
    if (note !== null) run(() => rejectPaymentReference(id, note));
  }

  async function noShow() {
    const ok = await confirm("It stays on your records, and Sales only counts the downpayment you kept. No email is sent.", {
      title: `Mark ${id} as a no-show?`,
      confirmLabel: "Mark no-show",
    });
    if (ok) run(() => markNoShow(id, true));
  }

  const primary = "rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
  const secondary = "rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium hover:border-emerald-600 disabled:opacity-50";
  const danger = "rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";
  const started = b.date < today || (b.date === today && b.startHour <= facilityNow().hour);
  const balanceDue = status === "confirmed" && !b.blocked && !b.noShowAt && !b.balancePaidAt && b.total > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        {status === "pending" && (
          <>
            {noDownpayment ? (
              <button className={primary} disabled={pending} onClick={() => run(() => approveBooking(id))} title="Confirm (and email the customer). No downpayment: they pay at the venue">
                Approve &amp; confirm
              </button>
            ) : emailed ? (
              <button className={primary} disabled={pending} onClick={() => run(() => approveBooking(id))} title="Approve and email the customer the payment QR">
                Approve &amp; send QR
              </button>
            ) : (
              <button className={primary} disabled={pending} onClick={() => run(() => approveBooking(id))} title="No email on file: approve, then collect the downpayment yourself">
                Approve
              </button>
            )}
            <button className={danger} disabled={pending} onClick={() => cancel("Decline")}>
              Decline
            </button>
          </>
        )}
        {status === "awaiting_payment" && (
          <>
            <button className={primary} disabled={pending} onClick={markReceived}>
              Downpayment received
            </button>
            <MoreMenu
              disabled={pending}
              items={[
                ...(b.paymentRef ? [{ label: "Payment not found…", onSelect: notFound }] : []),
                ...(emailed ? [{ label: "Resend payment email", onSelect: () => run(() => resendPaymentEmail(id)) }] : []),
                { label: "Cancel booking", onSelect: () => cancel("Cancel"), danger: true },
              ]}
            />
          </>
        )}
        {status === "confirmed" && (
          <>
            {balanceDue && (
              <button className={secondary} disabled={pending} onClick={() => run(() => markBalancePaid(id, true))} title="The customer paid the rest at the venue">
                Paid in full
              </button>
            )}
            <MoreMenu
              disabled={pending}
              items={[
                ...(!b.blocked && b.balancePaidAt ? [{ label: "Undo paid in full", onSelect: () => run(() => markBalancePaid(id, false)) }] : []),
                ...(!b.blocked && started && !b.noShowAt ? [{ label: "Mark no-show", onSelect: noShow }] : []),
                ...(b.noShowAt ? [{ label: "Undo no-show", onSelect: () => run(() => markNoShow(id, false)) }] : []),
                { label: b.blocked ? "Remove block" : "Cancel booking", onSelect: () => cancel("Cancel"), danger: true },
              ]}
            />
          </>
        )}
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
  const { confirm } = useDialog();

  async function erase() {
    const ok = await confirm(`The customer's name, email, phone, notes and payment reference are removed from ${id}. The booking itself stays. This can't be undone.`, {
      title: "Erase customer details?",
      confirmLabel: "Erase",
      danger: true,
    });
    if (!ok) return;
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

/** A booking reference that copies itself to the clipboard on click. */
export function CopyReference({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context): the text is still selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy booking reference"
      aria-label={`Copy booking reference ${id}`}
      className="group inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 font-mono text-xs text-black/60 hover:bg-black/5 hover:text-black"
    >
      {id}
      <span className={`font-sans text-[10px] ${copied ? "text-emerald-700" : "text-black/30 group-hover:text-black/60"}`} aria-live="polite">
        {copied ? "Copied" : "⧉"}
      </span>
    </button>
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
