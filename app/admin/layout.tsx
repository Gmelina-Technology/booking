import type { Metadata } from "next";
import { Suspense } from "react";
import { logout } from "../login/actions";
import AdminTabs, { TabLinks } from "./tabs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <div className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-black/40">Staff</span>
          <Suspense fallback={<TabLinks pathname={null} />}>
            <AdminTabs />
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
