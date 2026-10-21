import type { Metadata } from "next";
import Link from "next/link";
import SignupForm from "./signup-form";

export const metadata: Metadata = { title: "Create your booking page" };

export default function SignupPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Create your booking page</h1>
        <p className="mt-1 text-sm text-black/60">
          You&apos;ll get a public page for customers and a staff inbox for you.
        </p>
        <SignupForm />
      </div>
      <p className="mt-4 text-center text-sm text-black/60">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
