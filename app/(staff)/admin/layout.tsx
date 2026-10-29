import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentOwner } from "@/lib/auth";
import { ownerPath } from "@/lib/owners";
import { listBookings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import AdminNav, { Sidebar } from "./nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const top = (
    <Suspense fallback={<span className="px-1 text-xs font-semibold uppercase tracking-widest text-black/40">Staff</span>}>
      <OwnerBadge />
    </Suspense>
  );
  return (
    <div className="mx-auto w-full max-w-[90rem] md:flex">
      <Suspense fallback={<Sidebar pathname={null} inboxCount={0} top={top} />}>
        <Nav top={top} />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The menu, with the count of bookings that need a staff decision on the Inbox link. */
async function Nav({ top }: { top: React.ReactNode }) {
  await connection();
  const owner = await currentOwner();
  let inboxCount = 0;
  if (owner) {
    const today = facilityNow().date;
    const upcoming = (await listBookings({ ownerId: owner.id })).filter((b) => b.date >= today);
    inboxCount = upcoming.filter((b) => b.status === "pending" || (b.status === "awaiting_payment" && b.paymentRef)).length;
  }
  return <AdminNav inboxCount={inboxCount} top={top} />;
}

/** Who is signed in, with a link to their public page. */
async function OwnerBadge() {
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-sm font-bold text-white" aria-hidden>
        {owner.profile.name.trim()[0]?.toUpperCase() ?? "@"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{owner.profile.name}</p>
        <Link
          href={ownerPath(owner.handle)}
          target="_blank"
          className="block truncate text-xs text-black/50 hover:text-emerald-700"
          title="Open your public booking page"
        >
          @{owner.handle} · View page ↗
        </Link>
      </div>
    </div>
  );
}
