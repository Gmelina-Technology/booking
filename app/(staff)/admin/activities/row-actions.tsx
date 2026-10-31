"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useDialog } from "../dialog";
import { removeActivity, reorderActivity, setActivityActive } from "./actions";

export function ActivityRowActions({
  slug,
  name,
  active,
  isFirst,
  isLast,
  canDelete,
}: {
  slug: string;
  name: string;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const { alert, confirm } = useDialog();
  const btn =
    "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:border-emerald-600 disabled:opacity-30 disabled:hover:border-black/10";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${pending ? "opacity-50" : ""}`}>
      <button className={btn} disabled={pending || isFirst} onClick={() => start(() => reorderActivity(slug, -1))} aria-label={`Move ${name} up`}>
        ↑
      </button>
      <button className={btn} disabled={pending || isLast} onClick={() => start(() => reorderActivity(slug, 1))} aria-label={`Move ${name} down`}>
        ↓
      </button>
      <button className={btn} disabled={pending} onClick={() => start(() => setActivityActive(slug, !active))}>
        {active ? "Hide" : "Show"}
      </button>
      <Link href={`/admin/activities/${slug}`} className={btn}>
        Edit
      </Link>
      <button
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={pending || !canDelete}
        title={canDelete ? undefined : "Has bookings — hide it instead"}
        onClick={async () => {
          if (!(await confirm(`${name} will be removed for good. This can't be undone.`, { title: `Delete ${name}?`, confirmLabel: "Delete", danger: true }))) return;
          start(async () => {
            const result = await removeActivity(slug);
            if (!result.ok) await alert(result.error ?? "Please try again.", { title: "Couldn't delete" });
          });
        }}
      >
        Delete
      </button>
    </div>
  );
}
