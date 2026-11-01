import Link from "next/link";
import type { PageInfo } from "@/lib/paging";

/** "51–100 of 230" with previous and next links, under a table split into pages (lib/paging.ts). Hidden when it all fits on one page. */
export function Pager({ page, pages, from, to, total, href }: PageInfo & { href: (page: number) => string }) {
  if (pages <= 1) return null;
  const btn = "px-3 py-2 text-sm font-medium";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 px-4 py-3">
      <p className="text-sm text-black/50">
        {from}–{to} of {total}
      </p>
      <nav className="flex divide-x divide-black/10 overflow-hidden rounded-lg border border-black/10" aria-label="Pages">
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${btn} hover:bg-black/[0.03]`}>
            ‹ Prev
          </Link>
        ) : (
          <span className={`${btn} text-black/30`}>‹ Prev</span>
        )}
        <span className={`${btn} text-black/50`} aria-current="page">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={`${btn} hover:bg-black/[0.03]`}>
            Next ›
          </Link>
        ) : (
          <span className={`${btn} text-black/30`}>Next ›</span>
        )}
      </nav>
    </div>
  );
}
