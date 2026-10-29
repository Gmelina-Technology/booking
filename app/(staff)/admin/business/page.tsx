import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { ownerPath } from "@/lib/owners";
import BusinessForm from "./business-form";

export const metadata = { title: "Staff — business profile" };

export default function BusinessPage({ searchParams }: PageProps<"/admin/business">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Business profile</h1>
      <p className="mt-1 text-black/60">Your public booking page and the details customers see.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Business searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Business({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { welcome } = await searchParams;
  await connection();
  const owner = await requireOwner();
  const path = ownerPath(owner.handle);

  return (
    <div className="mt-8 space-y-6">
      {welcome && (
        <div className="rounded-2xl border border-lime-300 bg-lime-50 p-5 text-sm">
          <p className="font-semibold text-emerald-900">Your page is live 🎉</p>
          <p className="mt-1 text-emerald-900/80">
            Next: add your address and phone below, set your prices and courts in{" "}
            <Link href="/admin/activities" className="font-semibold underline">
              Activities
            </Link>
            , and upload your payment QR in{" "}
            <Link href="/admin/settings" className="font-semibold underline">
              Payments &amp; alerts
            </Link>
            . We started you off with a few sample activities. Edit or hide the ones you don&apos;t offer.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Your booking page</h2>
        <p className="mt-1 text-sm text-black/60">Share this link with customers. It can&apos;t be changed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-black/5 px-3 py-2 text-sm">{path}</code>
          <Link href={path} target="_blank" className="text-sm font-semibold text-emerald-700 hover:underline">
            Open page ↗
          </Link>
        </div>
        <p className="mt-3 text-xs text-black/50">
          Signed in as {owner.email}.{" "}
          <Link href="/admin/account" className="underline hover:text-black">
            Manage your account
          </Link>
        </p>
      </section>

      <BusinessForm profile={owner.profile} />
    </div>
  );
}
