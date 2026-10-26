"use client";

import { useActionState } from "react";
import { RESET_MINUTES } from "@/lib/password-rules";
import { requestPasswordReset, type RequestResetState } from "./actions";

const input =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export default function RequestResetForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestPasswordReset, { error: null, sent: false, email: "" });

  if (state.sent) {
    return (
      <div role="status" className="mt-6 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
        If there&apos;s an account for <strong>{state.email}</strong>, we&apos;ve emailed it a reset link. The link works for {RESET_MINUTES}{" "}
        minutes. Check your spam folder if it doesn&apos;t arrive.
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" autoComplete="email" required autoFocus defaultValue={state.email} className={input} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
