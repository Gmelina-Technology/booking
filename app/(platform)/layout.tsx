import Link from "next/link";
import { Suspense } from "react";
import { currentOwnerId } from "@/lib/auth";
import { platform } from "@/lib/facility";
import { getPublicOwners } from "@/lib/owners";
import MobileMenu from "./mobile-menu";

const primaryButton = "ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800";
const desktopLink = "hidden whitespace-nowrap rounded-lg px-3 py-2 hover:bg-black/5 sm:block";

/** Reads who is signed in and whether any venue is listed yet, then draws the header links. */
async function Nav() {
  const [ownerId, owners] = await Promise.all([currentOwnerId(), getPublicOwners()]);
  return <NavLinks signedIn={!!ownerId} hasVenues={owners.length > 0} />;
}

/**
 * "Dashboard" for a signed-in owner, otherwise sign-in and sign-up links. "Find a venue"
 * only once there's a venue to find. On phones everything but the main button sits in a menu.
 */
function NavLinks({ signedIn, hasVenues }: { signedIn: boolean; hasVenues: boolean }) {
  const links = [
    ...(hasVenues ? [{ href: "/#businesses", label: "Find a venue" }] : []),
    { href: "/pricing", label: "Pricing" },
    ...(signedIn ? [] : [{ href: "/login", label: "Sign in" }]),
  ];
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={desktopLink}>
          {l.label}
        </Link>
      ))}
      <Link href={signedIn ? "/admin" : "/signup"} className={primaryButton}>
        {signedIn ? (
          "Dashboard"
        ) : (
          <>
            Create your <span className="hidden sm:inline">booking </span>page
          </>
        )}
      </Link>
      <MobileMenu links={links} />
    </>
  );
}

/** Header and footer for the platform's own pages: home, sign-up, sign-in, and booking links. */
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
            <Suspense fallback={<NavLinks signedIn={false} hasVenues={false} />}>
              <Nav />
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
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/pricing" className="hover:text-black hover:underline">
              Pricing
            </Link>
            <Link href="/signup" className="hover:text-black hover:underline">
              Create your booking page
            </Link>
            {platform.supportEmail && (
              <a href={`mailto:${platform.supportEmail}`} className="hover:text-black hover:underline">
                Contact
              </a>
            )}
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
