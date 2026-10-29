"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { signup, type SignupState } from "./actions";

const input =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

/** Suggests a page name from the business name: "Courtside Hub!" -> "courtside-hub". */
function suggestHandle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

export default function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {
    step: "details",
    error: null,
    notice: null,
    sentTo: "",
    values: { name: "", handle: "", email: "" },
  });
  const [name, setName] = useState(state.values.name);
  const [handle, setHandle] = useState(state.values.handle);
  const [handleEdited, setHandleEdited] = useState(false);
  const shownHandle = handleEdited ? handle : handle || suggestHandle(name);

  if (state.step === "verify") return <VerifyStep state={state} action={action} pending={pending} />;

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="intent" value="start" />
      {/* Honeypot: hidden from people and screen readers. Bots that fill every field get rejected. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Business name</span>
        <input
          name="name"
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Courtside Hub"
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Page name</span>
        <div className="mt-1 flex items-center rounded-lg border border-black/15 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
          <span className="select-none pl-3 text-black/40">/p/@</span>
          <input
            name="handle"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={shownHandle}
            onChange={(e) => {
              setHandleEdited(true);
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="courtside-hub"
            className="w-full min-w-0 rounded-r-lg bg-transparent py-2 pr-3 outline-none"
          />
        </div>
        <span className="mt-1 block text-xs text-black/50">Lowercase letters, numbers and hyphens. This is your link, and it can&apos;t be changed later.</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values.email} className={input} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={input}
        />
        <span className="mt-1 block text-xs text-black/50">At least {MIN_PASSWORD_LENGTH} characters.</span>
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
        {pending ? "Sending your code…" : "Continue"}
      </button>
      <p className="text-center text-xs text-black/50">
        We&apos;ll email you a code to confirm it&apos;s you. By continuing, you agree to the{" "}
        <Link href="/terms" target="_blank" className="underline hover:text-black">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="underline hover:text-black">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}

/** Second step: the 6-digit code emailed to the owner. The account is created only once it matches. */
function VerifyStep({ state, action, pending }: { state: SignupState; action: (form: FormData) => void; pending: boolean }) {
  return (
    <div className="mt-6 space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="verify" />
        <p className="text-sm text-black/70">
          We sent a 6-digit code to <strong>{state.sentTo}</strong>. Enter it to create <strong>@{state.values.handle}</strong>.
        </p>
        <label className="block text-sm">
          <span className="font-medium">Verification code</span>
          <input
            name="code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\s*\d{6}\s*"
            maxLength={8}
            placeholder="123456"
            className={`${input} text-center font-mono text-2xl tracking-[0.5em]`}
          />
        </label>
        {state.notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.notice}</p>}
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
          {pending ? "Checking…" : "Verify & create my page"}
        </button>
      </form>
      <form action={action} className="flex items-center justify-between text-sm">
        <button name="intent" value="resend" disabled={pending} className="font-semibold text-emerald-700 hover:underline disabled:opacity-60">
          Send a new code
        </button>
        <button name="intent" value="restart" disabled={pending} className="text-black/60 hover:underline disabled:opacity-60">
          Change details
        </button>
      </form>
    </div>
  );
}
