import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentAccount, currentOwner, isPlatformAdmin } from "@/lib/auth";
import { platform } from "@/lib/facility";
import { ownerPath } from "@/lib/owners";
import { listBookings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import StaffNav, { Sidebar } from "../nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: LayoutProps<"/app">) {
  const top = (
    <Suspense fallback={<span className="px-1 text-xs font-semibold uppercase tracking-widest text-black/40">Staff</span>}>
      <OwnerBadge />
    </Suspense>
  );
  return (
    <div className="w-full md:flex">
      <Suspense fallback={<Sidebar area="app" pathname={null} inboxCount={0} top={top} />}>
        <Nav top={top} />
      </Suspense>
      <div className="min-w-0 flex-1">
        <Suspense>
          <SuspendedNotice />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

/** Tells a suspended partner (or an admin viewing as one) why their page is offline. */
async function SuspendedNotice() {
  await connection();
  const owner = await currentOwner();
  if (!owner?.suspension) return null;
  const since = new Date(owner.suspension.at).toLocaleDateString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium" });
  return (
    <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 md:px-6">
      <p>
        <strong>Your booking page is suspended</strong> (since {since}). Customers can&apos;t open it or send new requests. Reason:{" "}
        {owner.suspension.reason}
      </p>
      <p className="mt-1 text-red-900/80">
        Your existing bookings are unchanged and still need you. {platform.supportEmail ? `Questions? Email ${platform.supportEmail}.` : "Reply to the email we sent you with any questions."}
      </p>
    </div>
  );
}

/** The menu, with the count of bookings that need a staff decision on the Inbox link. */
async function Nav({ top }: { top: React.ReactNode }) {
  await connection();
  const [owner, account] = await Promise.all([currentOwner(), currentAccount()]);
  let inboxCount = 0;
  if (owner) {
    const today = facilityNow().date;
    const upcoming = (await listBookings({ ownerId: owner.id })).filter((b) => b.date >= today);
    inboxCount = upcoming.filter((b) => b.status === "pending" || (b.status === "awaiting_payment" && b.paymentRef)).length;
  }
  return <StaffNav area="app" inboxCount={inboxCount} top={top} platformAdmin={!!account && isPlatformAdmin(account)} />;
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
