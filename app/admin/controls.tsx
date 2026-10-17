"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cancelBooking } from "@/app/actions";
import { addDays, formatDate } from "@/lib/time";

export function Filters({
  date,
  today,
  activity,
  activities,
}: {
  date: string;
  today: string;
  activity: string;
  activities: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function go(next: { date?: string; activity?: string }) {
    const params = new URLSearchParams();
    params.set("date", next.date ?? date);
    const a = next.activity ?? activity;
    if (a) params.set("activity", a);
    router.push(`${pathname}?${params}`);
  }

  const btn = "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:border-emerald-600";

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
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

export function CancelButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(`Cancel booking ${id}? The slot will be released.`)) start(() => cancelBooking(id));
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}
