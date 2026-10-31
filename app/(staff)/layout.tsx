import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/(platform)/login/actions";
import { platform } from "@/lib/facility";
import { DialogProvider } from "./admin/dialog";
import NotificationBell from "./admin/notifications";
import ViewingAsBar from "./admin/viewing-as-bar";

/** Header for the staff area: the logo, notifications and sign-out. The menu lives in admin/layout.tsx. */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 md:px-5">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">{platform.name[0]}</span>
            {platform.name}
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <form action={logout}>
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 hover:text-black">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <Suspense>
          <ViewingAsBar />
        </Suspense>
      </header>
      <main className="flex-1">{children}</main>
    </DialogProvider>
  );
}
