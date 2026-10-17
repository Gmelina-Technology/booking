import { Suspense } from "react";
import AdminTabs, { TabLinks } from "./tabs";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <div className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-black/40">Staff</span>
          <Suspense fallback={<TabLinks pathname={null} />}>
            <AdminTabs />
          </Suspense>
        </div>
      </div>
      {children}
    </>
  );
}
