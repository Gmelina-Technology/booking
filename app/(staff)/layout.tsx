import Link from "next/link";
import { logout } from "@/app/(platform)/login/actions";
import { platform } from "@/lib/facility";

/** Header for the staff area: the logo and sign-out only. The menu lives in admin/layout.tsx. */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">{platform.name[0]}</span>
            {platform.name}
          </Link>
          <form action={logout}>
            <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 hover:text-black">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
