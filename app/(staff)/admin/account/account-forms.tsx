"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { changePassword, deleteAccount, requestEmailChange, type AccountState } from "./actions";

const input =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const primary = "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";

function Result({ state }: { state: AccountState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-700"}`}>
      {state.message}
    </p>
  );
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
  const [state, action, pending] = useActionState(requestEmailChange, null);
  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium">New sign-in email</span>
        <input name="email" type="email" autoComplete="email" required maxLength={254} className={input} />
      </label>
      <CurrentPassword />
      <div className="space-y-3 sm:col-span-2">
        <Result state={state} />
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Sending…" : "Send confirmation link"}
        </button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
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
      <div className="space-y-3 sm:col-span-2">
        <Result state={state} />
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState(deleteAccount, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete @${handle} and all its data for good?`)) e.preventDefault();
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
      <div className="space-y-3 sm:col-span-2">
        <Result state={state} />
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
