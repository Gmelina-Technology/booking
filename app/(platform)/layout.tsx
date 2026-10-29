import Link from "next/link";
import { Suspense } from "react";
import { currentOwnerId } from "@/lib/auth";
import { platform } from "@/lib/facility";

const primaryButton = "ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800";

/** "Dashboard" for a signed-in owner, otherwise sign-in and sign-up links. */
async function AccountLinks() {
  if (!(await currentOwnerId())) return <SignedOutLinks />;
  return (
    <Link href="/admin" className={primaryButton}>
      Dashboard
    </Link>
  );
}

function SignedOutLinks() {
  return (
    <>
      <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-black/5">
        Sign in
      </Link>
      <Link href="/signup" className={primaryButton}>
        Create your page
      </Link>
    </>
  );
}

/** Header and footer for the platform's own pages: home, sign-up, sign-in, the staff area and booking links. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">{platform.name[0]}</span>
            {platform.name}
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/#businesses" className="hidden rounded-lg px-3 py-2 hover:bg-black/5 sm:block">
              Find a venue
            </Link>
            <Suspense fallback={<SignedOutLinks />}>
              <AccountLinks />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-8 text-sm text-black/60">
          <p>
            <span className="font-semibold text-black">{platform.name}</span> · {platform.tagline}
          </p>
          <p className="flex gap-4">
            <Link href="/signup" className="hover:text-black hover:underline">
              List your facility
            </Link>
            <Link href="/privacy" className="hover:text-black hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-black hover:underline">
              Terms
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
