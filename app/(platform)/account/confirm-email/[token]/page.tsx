import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { emailChangeMatches, readEmailChangeToken } from "@/lib/email-change";
import { authConfigured } from "@/lib/session";
import { getOwnerById } from "@/lib/store";
import { confirmEmailChange } from "./actions";

export const metadata: Metadata = {
  title: "Confirm your new email",
  robots: { index: false, follow: false },
  // The URL holds the confirmation token; don't leak it to other sites.
  referrer: "no-referrer",
};

export default function ConfirmEmailPage({ params }: PageProps<"/account/confirm-email/[token]">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <Suspense fallback={<div className="h-40" />}>
          <Confirm params={params} />
        </Suspense>
      </div>
    </div>
  );
}

// Opening the link only shows a button: email scanners that follow links
// shouldn't be able to change the address on their own.
async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  await connection();
  const request = authConfigured() ? readEmailChangeToken(token) : null;
  const owner = request && (await getOwnerById(request.ownerId));
  if (!request || !owner || !emailChangeMatches(owner, token)) {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-black/60">This link has expired or was already used. Ask for a new one from Account & security in the staff menu.</p>
        <Link href="/app/account" className="mt-6 block text-center text-sm font-semibold text-emerald-700 hover:underline">
          Go to Account
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Confirm your new email</h1>
      <p className="mt-2 text-sm text-black/60">
        Sign in to <strong className="text-black">@{owner.handle}</strong> with <strong className="text-black">{request.newEmail}</strong> from now
        on. Your password stays the same.
      </p>
      <form action={confirmEmailChange.bind(null, token)} className="mt-6">
        <button type="submit" className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800">
          Use this email
        </button>
      </form>
    </>
  );
}
