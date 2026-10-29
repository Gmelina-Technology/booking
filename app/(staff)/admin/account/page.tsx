import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { logoutEverywhere } from "@/app/(platform)/login/actions";

export const metadata = { title: "Staff — account & security" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Account &amp; security</h1>
      <p className="mt-1 text-black/60">How you sign in, and the devices that are signed in.</p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-black/5" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  await connection();
  const owner = await requireOwner();

  return (
    <div className="mt-8 space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold">Sign-in</h2>
          <p className="mt-1 text-sm text-black/60">
            You sign in as <span className="font-medium text-black">{owner.email}</span>.
          </p>
        </div>
        <Link href="/reset-password" className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold hover:border-emerald-600">
          Change password
        </Link>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Signed-in devices</h2>
        <p className="mt-1 text-sm text-black/60">
          Lost a phone, or shared the password with someone who has left? Sign out everywhere, including this browser. Everyone will need the
          password to sign in again. Resetting your password does this too.
        </p>
        <form action={logoutEverywhere} className="mt-3">
          <button type="submit" className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
            Sign out on all devices
          </button>
        </form>
      </section>
    </div>
  );
}
