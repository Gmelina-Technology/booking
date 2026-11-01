"use client";

import { useTransition } from "react";
import { toast } from "@/app/toaster";
import type { Closure } from "@/lib/facility";
import { formatDate } from "@/lib/time";
import { addClosure, removeClosure } from "./actions";

/** Days the business, or one activity, is closed: customers can't book them. */
export function Closures({ closures, activities, today }: { closures: Closure[]; activities: { slug: string; name: string }[]; today: string }) {
  const [pending, start] = useTransition();
  const name = new Map(activities.map((a) => [a.slug, a.name]));
  const upcoming = closures.filter((c) => c.date >= today);
  const field = "mt-1 block w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm";

  return (
    <section className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">Closures</h2>
        <p className="text-sm text-black/50">
          Holidays and maintenance days. Customers can&apos;t book them; you still can. To close certain hours instead, use Create Booking →
          Block the court. Weekly closed days are set on each activity.
        </p>
      </div>
      <form
        action={(form) => {
          start(async () => toast.result(await addClosure(String(form.get("date")), String(form.get("activity")), String(form.get("note")))));
        }}
        className="grid gap-3 sm:grid-cols-[10rem_12rem_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="block text-sm">
          <span className="font-medium">Date</span>
          <input type="date" name="date" min={today} required className={field} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">What&apos;s closed</span>
          <select name="activity" className={field}>
            <option value="">Everything</option>
            {activities.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Note for customers</span>
          <input name="note" maxLength={80} placeholder="Holiday, court resurfacing…" className={field} />
        </label>
        <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
          {pending ? "Adding…" : "Close day"}
        </button>
      </form>
      {upcoming.length === 0 ? (
        <p className="text-sm text-black/50">No closures coming up.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-xl border border-black/5 text-sm">
          {upcoming.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">{formatDate(c.date, { year: "numeric" })}</span>
                <span className="text-black/60"> · {c.activitySlug ? (name.get(c.activitySlug) ?? c.activitySlug) : "Everything"}</span>
                {c.note && <span className="text-black/50"> · {c.note}</span>}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => removeClosure(c.id))}
                className="rounded-lg border border-black/10 px-2.5 py-1 text-xs hover:border-red-300 hover:text-red-700"
              >
                Reopen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
