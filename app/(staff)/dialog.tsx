"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Options = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button and Cancel focused first, for things that can't be undone. */
  danger?: boolean;
};
type PromptOptions = Options & { label?: string; placeholder?: string; defaultValue?: string };

type Request = PromptOptions & {
  kind: "alert" | "confirm" | "prompt";
  message: string;
  /** The typed text (or "") on OK, null on Cancel / Escape / backdrop. */
  resolve: (value: string | null) => void;
};

type Dialogs = {
  alert: (message: string, options?: Options) => Promise<void>;
  confirm: (message: string, options?: Options) => Promise<boolean>;
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<Dialogs | null>(null);

/** Promise-based stand-ins for window.alert / confirm / prompt that match the app's look. */
export function useDialog(): Dialogs {
  const dialogs = useContext(DialogContext);
  if (!dialogs) throw new Error("useDialog must be used inside <DialogProvider>");
  return dialogs;
}

/** Hosts the one modal the staff area shows for alerts, confirmations and prompts. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const open = useCallback(
    (kind: Request["kind"], message: string, options: PromptOptions = {}) =>
      new Promise<string | null>((resolve) =>
        setRequest((prev) => {
          prev?.resolve(null); // A new question replaces an unanswered one.
          return { ...options, kind, message, resolve };
        }),
      ),
    [],
  );

  const [dialogs] = useState<Dialogs>(() => ({
    alert: async (message, options) => void (await open("alert", message, options)),
    confirm: async (message, options) => (await open("confirm", message, options)) !== null,
    prompt: (message, options) => open("prompt", message, options),
  }));

  useEffect(() => {
    const el = dialog.current;
    if (!request || !el) return;
    if (!el.open) el.showModal();
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [request]);

  function finish(value: string | null) {
    dialog.current?.close();
    request?.resolve(value);
    setRequest(null);
  }

  const kind = request?.kind;
  const cancelable = kind !== "alert";
  const confirmClass = request?.danger
    ? "rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
    : "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800";

  return (
    <DialogContext.Provider value={dialogs}>
      {children}
      <dialog
        ref={dialog}
        role={kind === "alert" ? "alertdialog" : undefined}
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/30"
        onCancel={(e) => {
          e.preventDefault();
          finish(null);
        }}
        onClick={(e) => e.target === dialog.current && finish(null)}
      >
        {request && (
          <form
            className="space-y-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              finish(kind === "prompt" ? (input.current?.value ?? "") : "");
            }}
          >
            <div className="space-y-1.5">
              <h2 id="app-dialog-title" className="text-lg font-bold">
                {request.title ?? (kind === "alert" ? "Something went wrong" : "Are you sure?")}
              </h2>
              <p id="app-dialog-message" className="whitespace-pre-line text-sm text-black/60">
                {request.message}
              </p>
            </div>
            {kind === "prompt" && (
              <label className="block text-sm">
                {request.label && <span className="font-medium">{request.label}</span>}
                <input
                  ref={input}
                  data-autofocus
                  defaultValue={request.defaultValue}
                  placeholder={request.placeholder}
                  className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {cancelable && (
                <button
                  type="button"
                  data-autofocus={request.danger && kind !== "prompt" ? true : undefined}
                  onClick={() => finish(null)}
                  className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5"
                >
                  {request.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button type="submit" data-autofocus={!request.danger && kind !== "prompt" ? true : undefined} className={confirmClass}>
                {request.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}
