"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

type Tone = "success" | "error";
type Toast = { id: number; tone: Tone; message: string };

const MAX_SHOWN = 4;
const empty: Toast[] = [];
let toasts: Toast[] = empty;
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function dismiss(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function show(tone: Tone, message: string | null | undefined) {
  if (!message) return;
  // The same message again (a retry, a double click) restarts its timer instead of stacking.
  const same = toasts.find((t) => t.tone === tone && t.message === message);
  const id = same?.id ?? nextId++;
  if (!same) toasts = [...toasts, { id, tone, message }].slice(-MAX_SHOWN);
  clearTimeout(timers.get(id));
  // Errors stay longer: they usually say what to fix.
  timers.set(id, setTimeout(() => dismiss(id), tone === "error" ? 8000 : 5000));
  emit();
}

/** Short-lived messages in the corner: what an action did, or why it didn't. Callable from any client component. */
export const toast = {
  success: (message: string | null | undefined) => show("success", message),
  error: (message: string | null | undefined) => show("error", message),
  /** An action's { ok, message } result. */
  result: (r: { ok: boolean; message: string } | null | undefined) => {
    if (r) show(r.ok ? "success" : "error", r.message);
  },
};

/**
 * Toasts a message the server passed to the page, e.g. after a redirect, then drops `param`
 * from the URL so a refresh doesn't show it again.
 */
export function ToastOnLoad({ message, tone = "success", param }: { message: string; tone?: Tone; param?: string }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    show(tone, message);
    if (param) {
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState(null, "", url);
    }
  }, [message, tone, param]);
  return null;
}

/** Hosts the toasts. Mounted once, in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => empty);
  const host = useRef<HTMLDivElement>(null);

  // A manual popover sits in the top layer, so toasts show above open modal dialogs (e.g. Create
  // booking). Re-opening it on each change moves it above any dialog opened since.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el?.showPopover) return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (list.length) el.showPopover();
  }, [list]);

  return (
    <div
      ref={host}
      popover="manual"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-0 m-0 hidden w-full open:flex max-w-none flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-4 sm:left-auto sm:items-end"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg ${
            t.tone === "error" ? "border-red-200 text-red-800" : "border-emerald-200 text-emerald-900"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${t.tone === "error" ? "bg-red-600" : "bg-emerald-600"}`}
          >
            {t.tone === "error" ? "!" : "✓"}
          </span>
          <p className="min-w-0 flex-1 break-words">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 shrink-0 rounded px-1 text-base leading-5 text-black/40 hover:text-black">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
