import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { isStaff } from "@/lib/auth";
import { listBookings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import { logout } from "../login/actions";
import AdminTabs, { TabLinks } from "./tabs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <div className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto overflow-y-hidden whitespace-nowrap px-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-black/40">Staff</span>
          <Suspense fallback={<TabLinks pathname={null} />}>
            <AdminTabs />
          </Suspense>
          <Suspense fallback={null}>
            <ToReview />
          </Suspense>
          <form action={logout} className="ml-auto">
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5 hover:text-black">
              Sign out
            </button>
          </form>
        </div>
      </div>
      {children}
    </>
  );
}

/** Count of bookings that need a staff decision, shown in the staff bar. */
async function ToReview() {
  await connection();
  if (!(await isStaff())) return null;
  const today = facilityNow().date;
  const upcoming = (await listBookings()).filter((b) => b.date >= today);
  const requests = upcoming.filter((b) => b.status === "pending").length;
  const toVerify = upcoming.filter((b) => b.status === "awaiting_payment" && b.paymentRef).length;
  const count = requests + toVerify;
  if (count === 0) return null;
  return (
    <Link href={`/admin?view=${requests ? "requests" : "verify"}`} className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-700">
      {count} to review
    </Link>
  );
}
