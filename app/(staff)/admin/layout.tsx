import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentOwner, isPlatformAdmin } from "@/lib/auth";
import StaffNav from "../nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** The platform admin area. Each page and action also calls requirePlatformAdmin(). */
export default function PlatformAdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="w-full md:flex">
      {/* Holds the sidebar's width until the menu streams in; the menu isn't in the static shell, so it isn't advertised. */}
      <Suspense fallback={<div className="hidden md:block md:w-60 md:shrink-0" />}>
        <Nav />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The platform menu, for platform admins only. */
async function Nav() {
  await connection();
  const owner = await currentOwner();
  if (!owner || !isPlatformAdmin(owner)) return null;
  const top = <span className="px-1 text-xs font-semibold uppercase tracking-widest text-black/40">Platform admin</span>;
  return <StaffNav area="admin" inboxCount={0} top={top} />;
}
