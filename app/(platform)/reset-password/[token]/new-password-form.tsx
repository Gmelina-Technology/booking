"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { resetPassword } from "../actions";

const input =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export default function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [error, action, pending] = useActionState(resetPassword, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers update the saved entry for this account. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <label className="block text-sm">
        <span className="font-medium">New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoFocus className={input} />
        <span className="mt-1 block text-xs text-black/50">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Type it again</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} className={input} />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password and sign in"}
      </button>
    </form>
  );
}
