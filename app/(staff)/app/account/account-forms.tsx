"use client";

import { startTransition, useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { toast } from "@/app/toaster";
import { useDialog } from "../../dialog";
import { changePassword, deleteAccount, requestEmailChange, type AccountState } from "./actions";

const input =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const primary = "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";

/** Runs an account action and toasts its result. */
function toasted(run: (prev: AccountState, form: FormData) => Promise<AccountState>) {
  return async (prev: AccountState, form: FormData) => {
    const next = await run(prev, form);
    toast.result(next);
    return next;
  };
}

function CurrentPassword() {
  return (
    <label className="block text-sm">
      <span className="font-medium">Current password</span>
      <input name="current" type="password" autoComplete="current-password" required className={input} />
    </label>
  );
}

export function ChangeEmailForm() {
  const [, action, pending] = useActionState(toasted(requestEmailChange), null);
  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium">New sign-in email</span>
        <input name="email" type="email" autoComplete="email" required maxLength={254} className={input} />
      </label>
      <CurrentPassword />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Sending…" : "Send confirmation link"}
        </button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [, action, pending] = useActionState(toasted(changePassword), null);
  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
        <CurrentPassword />
      </div>
      <label className="block text-sm">
        <span className="font-medium">New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} className={input} />
        <span className="mt-1 block text-xs text-black/50">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Type it again</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} className={input} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ handle }: { handle: string }) {
  const [, action, pending] = useActionState(toasted(deleteAccount), null);
  const { confirm } = useDialog();
  return (
    <form
      action={action}
      onSubmit={async (e) => {
        // Hold the submit until the dialog is answered, then run the action ourselves.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const ok = await confirm(`@${handle} and all its data will be deleted for good. This can't be undone.`, {
          title: "Delete your account?",
          confirmLabel: "Delete my account",
          danger: true,
        });
        if (ok) startTransition(() => action(data));
      }}
      className="mt-4 grid gap-4 sm:grid-cols-2"
    >
      <label className="block text-sm">
        <span className="font-medium">
          Type <code className="rounded bg-black/5 px-1">{handle}</code> to confirm
        </span>
        <input name="handle" required autoComplete="off" spellCheck={false} className={input} />
      </label>
      <CurrentPassword />
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
