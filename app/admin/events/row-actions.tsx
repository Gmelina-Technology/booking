"use client";

import Link from "next/link";
import { useTransition } from "react";
import { removeEvent, setEventPublished } from "./actions";

export function EventRowActions({ id, title, published }: { id: string; title: string; published: boolean }) {
  const [pending, start] = useTransition();
  const btn = "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:border-emerald-600 disabled:opacity-30";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${pending ? "opacity-50" : ""}`}>
      <button className={btn} disabled={pending} onClick={() => start(() => setEventPublished(id, !published))}>
        {published ? "Hide" : "Show"}
      </button>
      <Link href={`/admin/events/${id}`} className={btn}>
        Edit
      </Link>
      <button
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30"
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${title}" and its photo? This can't be undone.`)) start(() => removeEvent(id));
        }}
      >
        Delete
      </button>
    </div>
  );
}
