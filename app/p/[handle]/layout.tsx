import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { platform } from "@/lib/facility";
import { getPublicOwner, ownerFromParams, ownerPath } from "@/lib/owners";

// Every business page lives at /p/@<handle>. This layout gives it the
// business's own header and footer instead of the platform's.

export async function generateMetadata({ params }: LayoutProps<"/p/[handle]">): Promise<Metadata> {
  const owner = await getPublicOwner((await params).handle);
  if (!owner) return { title: "Not found" };
  const { name, tagline } = owner.profile;
  return { title: { absolute: `${name} — Book a court`, template: `%s · ${name}` }, description: tagline };
}

export default function OwnerLayout({ children, params }: LayoutProps<"/p/[handle]">) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Suspense fallback={<span className="h-8 w-40 animate-pulse rounded-lg bg-black/5" />}>
            <Brand params={params} />
          </Suspense>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/5 bg-white">
        <Suspense fallback={<div className="h-32" />}>
          <Footer params={params} />
        </Suspense>
      </footer>
    </>
  );
}

async function Brand({ params }: { params: Promise<{ handle: string }> }) {
  const { handle, profile } = await ownerFromParams(params);
  const home = ownerPath(handle);
  return (
    <>
      <Link href={home} className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white">
          {profile.name.trim()[0]?.toUpperCase()}
        </span>
        <span className="truncate">{profile.name}</span>
      </Link>
      <nav className="flex shrink-0 items-center gap-1 text-sm font-medium">
        <Link href={`${home}#activities`} className="hidden rounded-lg px-3 py-2 hover:bg-black/5 sm:block">
          Activities
        </Link>
        <Link
          href={`${home}#activities`}
          className="ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800"
        >
          Book now
        </Link>
      </nav>
    </>
  );
}

async function Footer({ params }: { params: Promise<{ handle: string }> }) {
  const { profile } = await ownerFromParams(params);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-black/60">
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-black">{profile.name}</p>
          {profile.tagline && <p className="mt-1">{profile.tagline}</p>}
        </div>
        {profile.address && (
          <div>
            <p className="font-semibold text-black">Visit</p>
            <p className="mt-1">{profile.address}</p>
          </div>
        )}
        {(profile.phone || profile.email) && (
          <div>
            <p className="font-semibold text-black">Contact</p>
            {profile.phone && <p className="mt-1">{profile.phone}</p>}
            {profile.email && <p>{profile.email}</p>}
          </div>
        )}
      </div>
      <p className="mt-8 text-xs text-black/40">
        Bookings by{" "}
        <Link href="/" className="hover:text-black/70 hover:underline">
          {platform.name}
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:text-black/70 hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-black/70 hover:underline">
          Terms
        </Link>
      </p>
    </div>
  );
}
