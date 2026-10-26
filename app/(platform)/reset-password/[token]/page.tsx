import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ownerForResetToken } from "@/lib/password-reset";
import { authConfigured } from "@/lib/session";
import NewPasswordForm from "./new-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The URL holds the reset token; don't leak it to other sites.
  referrer: "no-referrer",
};

export default function NewPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <Suspense fallback={<div className="h-64" />}>
          <ResetStep params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function ResetStep({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Expiry depends on the current time, so check at request time.
  await connection();
  const owner = authConfigured() ? await ownerForResetToken(decodeURIComponent(token)) : null;
  if (!owner) {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-black/60">This reset link has expired or was already used. Links work once, for a short time.</p>
        <Link
          href="/reset-password"
          className="mt-6 block w-full rounded-xl bg-emerald-700 px-6 py-3 text-center font-semibold text-white hover:bg-emerald-800"
        >
          Get a new link
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-black/60">For {owner.email}. You&apos;ll be signed in once it&apos;s saved.</p>
      <NewPasswordForm token={decodeURIComponent(token)} email={owner.email} />
    </>
  );
}
