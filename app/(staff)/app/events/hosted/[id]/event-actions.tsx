"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/app/toaster";
import type { HostedEvent } from "@/lib/facility";
import { useDialog } from "../../../../dialog";
import { cancelHostedEvent, deleteHostedEvent, duplicateHostedEvent, publishHostedEvent, type HostedResult } from "../actions";

/** Publish, edit, copy, cancel or delete one hosted event. */
export function EventActions({
  id,
  title,
  status,
  registrants,
  publicHref,
}: {
  id: string;
  title: string;
  status: HostedEvent["status"];
  registrants: number;
  publicHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, prompt } = useDialog();
  const btn = "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:border-emerald-600 disabled:opacity-40";
  const danger = "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40";

  function run(action: () => Promise<HostedResult>, then?: (r: Extract<HostedResult, { ok: true }>) => void) {
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Done.");
      then?.(result);
    });
  }

  async function cancel() {
    const reason = await prompt(
      registrants
        ? `${registrants} registrant${registrants === 1 ? " is" : "s are"} emailed that it's cancelled, and the courts are freed. Arrange any refunds yourself.`
        : "Registration stops and the courts are freed.",
      { title: `Cancel ${title}?`, label: "Reason (optional, included in the email)", confirmLabel: "Cancel event", cancelLabel: "Keep event", danger: true },
    );
    if (reason !== null) run(() => cancelHostedEvent(id, reason));
  }

  async function remove() {
    if (await confirm(`"${title}" will be removed. This can't be undone.`, { title: "Delete this event?", confirmLabel: "Delete", danger: true }))
      run(() => deleteHostedEvent(id), () => router.push("/app/events"));
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      {status === "draft" && (
        <button
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
          disabled={pending}
          onClick={() => run(() => publishHostedEvent(id))}
        >
          Publish
        </button>
      )}
      {publicHref && (
        <Link href={publicHref} target="_blank" className={btn}>
          View page ↗
        </Link>
      )}
      {status !== "cancelled" && (
        <Link href={`/app/events/hosted/${id}/edit`} className={btn}>
          Edit
        </Link>
      )}
      <button className={btn} disabled={pending} onClick={() => run(() => duplicateHostedEvent(id), (r) => router.push(`/app/events/hosted/${r.id}/edit`))}>
        Duplicate
      </button>
      {status === "published" ? (
        <button className={danger} disabled={pending} onClick={cancel}>
          Cancel event
        </button>
      ) : (
        <button className={danger} disabled={pending} onClick={remove}>
          Delete
        </button>
      )}
    </div>
  );
}
