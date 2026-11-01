"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "@/app/toaster";
import { createBanner } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

const kinds = {
  generic: { label: "Generic", hint: "Just informs. Partners press “Got it” to hide it." },
  custom: { label: "Custom", hint: "Its button changes something for the partner. Shows until they do it, only to partners who still need to." },
};

type Props = { actions: { key: string; label: string }[]; today: string };

/** "Create Banner" button and its form, which posts a banner to the top of partners' dashboard pages. */
export default function CreateBanner(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
      >
        <span className="flex size-6 items-center justify-center rounded-lg bg-white/15 text-base leading-none">+</span>
        Create Banner
      </button>
      {open && <BannerDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function BannerDialog({ actions, today, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"generic" | "custom">("generic");
  const [saving, start] = useTransition();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function submit(form: FormData) {
    start(async () => {
      const r = await createBanner(form);
      toast.result(r);
      if (r.ok) dialog.current?.close();
    });
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/30"
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <form action={submit} className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Create banner</h2>
            <p className="text-sm text-black/50">Shown at the top of every page of partners&apos; dashboards.</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-2 py-1 text-black/40 hover:bg-black/5" aria-label="Close">
            ✕
          </button>
        </div>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-medium text-black/60">Type</legend>
          {(["generic", "custom"] as const).map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${kind === k ? "border-emerald-600 bg-emerald-50" : "border-black/10"}`}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-0.5 accent-emerald-700" />
              <span>
                <span className="block font-medium">{kinds[k].label}</span>
                <span className="block text-xs text-black/50">{kinds[k].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {kind === "custom" && (
          <label className="block text-sm">
            <span className="font-medium">Button action</span>
            <select name="action" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Pick what it does…
              </option>
              {actions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="block text-sm">
            <span className="font-medium">Title</span>
            <input name="title" required maxLength={120} placeholder="e.g. Scheduled maintenance on Sunday" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Style</span>
            <select name="tone" className={inputClass} defaultValue="info">
              <option value="info">Info (blue)</option>
              <option value="warning">Important (amber)</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Message</span>
          <textarea name="body" required maxLength={600} rows={3} className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Link text (optional)</span>
            <input name="linkLabel" maxLength={60} placeholder="e.g. See billing details" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Link to (optional)</span>
            <input name="linkHref" maxLength={300} placeholder="/app/billing or https://…" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Only partners who joined before (optional)</span>
            <input name="joinedBefore" type="date" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Last day shown (optional)</span>
            <input name="until" type="date" min={today} className={inputClass} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-xl px-4 py-2.5 text-sm font-medium text-black/60 hover:bg-black/5">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {saving ? "Posting…" : "Post banner"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
