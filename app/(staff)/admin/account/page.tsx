import { connection } from "next/server";
import { Suspense } from "react";
import { currentViewingAs, requireOwner } from "@/lib/auth";
import { logoutEverywhere } from "@/app/(platform)/login/actions";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountForm } from "./account-forms";

export const metadata = { title: "Staff — account & security" };

export default function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Account &amp; security</h1>
      <p className="mt-1 text-black/60">How you sign in, and your account itself.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const card = "rounded-2xl border border-black/5 bg-white p-5 shadow-sm";

async function Account({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { emailChanged, emailTaken } = await searchParams;
  await connection();
  const [owner, viewing] = await Promise.all([requireOwner(), currentViewingAs()]);

  if (viewing)
    return (
      <p role="status" className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        You&apos;re viewing as <strong>@{owner.handle}</strong>. Their sign-in email ({owner.email}), password, signed-in devices and account
        deletion can only be changed by them, signed in as themselves.
      </p>
    );

  return (
    <div className="mt-8 space-y-6">
      {emailChanged && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your sign-in email is now <strong>{owner.email}</strong>.
        </p>
      )}
      {emailTaken && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Another account already uses that email, so your sign-in email wasn&apos;t changed.
        </p>
      )}

      <section className={card}>
        <h2 className="font-semibold">Sign-in email</h2>
        <p className="mt-1 text-sm text-black/60">
          You sign in as <strong className="text-black">{owner.email}</strong>. This is separate from the contact email on your page (Business profile).
        </p>
        <ChangeEmailForm />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 text-sm text-black/60">Changing it signs you out on every other device.</p>
        <ChangePasswordForm />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Signed-in devices</h2>
        <p className="mt-1 text-sm text-black/60">
          Lost a phone, or shared the password with someone who has left? Sign out everywhere, including this browser. Everyone will need the
          password to sign in again.
        </p>
        <form action={logoutEverywhere} className="mt-3">
          <button type="submit" className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">
            Sign out on all devices
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-red-800">Delete account</h2>
        <p className="mt-1 text-sm text-black/60">
          Permanently deletes your page <strong className="text-black">@{owner.handle}</strong>, every booking (including customers&apos; names,
          emails and phone numbers), your activities, events, photos and settings. This can&apos;t be undone. Cancel any upcoming bookings
          first, so each customer is told.
        </p>
        <DeleteAccountForm handle={owner.handle} />
      </section>
    </div>
  );
}
