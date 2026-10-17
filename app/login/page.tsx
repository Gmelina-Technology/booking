import type { Metadata } from "next";
import { Suspense } from "react";
import { facility } from "@/lib/facility";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Staff login",
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Staff login</h1>
        <p className="mt-1 text-sm text-black/60">Sign in to manage {facility.name} bookings.</p>
        <Suspense fallback={<div className="mt-6 h-32" />}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function LoginFormWithNext({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/admin"} />;
}
