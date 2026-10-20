"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { approveBooking, cancelBooking, markDownpaymentReceived, resendPaymentEmail, type StaffResult } from "./booking-actions";
import { addDays, formatDate } from "@/lib/time";

/**
 * Day picker (Schedule tab only) and activity filter. `view` is the selected
 * status tab, or null for Schedule; it's kept in the URL when filters change.
 */
export function Filters({
  view,
  date,
  today,
  activity,
  activities,
}: {
  view: string | null;
  date: string;
  today: string;
  activity: string;
  activities: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function go(next: { date?: string; activity?: string }) {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    else params.set("date", next.date ?? date);
    const a = next.activity ?? activity;
    if (a) params.set("activity", a);
    router.push(`${pathname}?${params}`);
  }

  const btn = "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:border-emerald-600";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {view ? (
        <span className="text-sm text-black/50">Upcoming bookings, all dates</span>
      ) : (
        <>
          <button className={btn} onClick={() => go({ date: addDays(date, -1) })} aria-label="Previous day">
            ←
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && go({ date: e.target.value })}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <button className={btn} onClick={() => go({ date: addDays(date, 1) })} aria-label="Next day">
            →
          </button>
          {date !== today && (
            <button className={btn} onClick={() => go({ date: today })}>
              Today
            </button>
          )}
          <span className="mx-2 hidden text-sm text-black/50 sm:inline">
            {formatDate(date, { weekday: "long", month: "long", year: "numeric" })}
          </span>
        </>
      )}
      <select
        value={activity}
        onChange={(e) => go({ activity: e.target.value })}
        className="ml-auto rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      >
        <option value="">All activities</option>
        {activities.map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.name}
          </option>
        ))}
      </select>
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
