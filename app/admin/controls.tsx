"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

  const primary = "rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
  const secondary = "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:border-emerald-600 disabled:opacity-50";
  const danger = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "pending" && (
          <>
            <button className={primary} disabled={pending} onClick={() => run(() => approveBooking(id))}>
              Approve &amp; send payment QR
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
            <button className={secondary} disabled={pending} onClick={() => run(() => resendPaymentEmail(id))}>
              Resend email
            </button>
            <button className={danger} disabled={pending} onClick={() => cancel("Cancel")}>
              Cancel
            </button>
          </>
        )}
        {status === "confirmed" && (
          <button className={danger} disabled={pending} onClick={() => cancel("Cancel")}>
            Cancel
          </button>
        )}
      </div>
      {pending && <p className="text-xs text-black/50">Working…</p>}
      {result && <p className={`max-w-xs text-right text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </div>
  );
}
