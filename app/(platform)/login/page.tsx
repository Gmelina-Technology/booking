import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-black/60">Manage your bookings, courts and payment settings.</p>
        <Suspense fallback={<div className="mt-6 h-48" />}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </div>
      <p className="mt-4 text-center text-sm text-black/60">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-emerald-700 hover:underline">
          Create your booking page
        </Link>
      </p>
    </div>
  );
}

async function LoginFormWithNext({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, signedOut } = await searchParams;
  return (
    <>
      {signedOut === "all" && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          You&apos;ve been signed out on all devices.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : "/app"} />
    </>
  );
}
