import type { Metadata } from "next";
import Link from "next/link";
import RequestResetForm from "./request-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-black/60">Enter your sign-in email and we&apos;ll send you a link to choose a new password.</p>
        <RequestResetForm />
      </div>
      <p className="mt-4 text-center text-sm text-black/60">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
