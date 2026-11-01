// Tables that list more than fits on a page show PAGE_SIZE rows at a time,
// with the page number in the URL (?page=N). Pure functions only, so they are
// easy to test (tests/staff-query.test.ts).

/** Rows per table page. */
export const PAGE_SIZE = 50;

/** Where a page sits in the whole list, for the Pager. `from` and `to` count from 1. */
export type PageInfo = { page: number; pages: number; from: number; to: number; total: number };

/** `?page=` as a page number, falling back to 1 for anything that isn't one. */
export function parsePage(value: string | string[] | undefined): number {
  return typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
}

/**
 * Which rows page `page` covers out of `total`. A page past the end (say,
 * after approving the last requests on it) is the last page instead of an
 * empty table.
 */
export function pageWindow(total: number, page: number, size = PAGE_SIZE): PageInfo & { offset: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const offset = (current - 1) * size;
  return { page: current, pages, from: offset + 1, to: Math.min(offset + size, total), total, offset };
}

/** One page of `rows`, already in memory. Lists in the database page with pageWindow() instead. */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): PageInfo & { rows: T[] } {
  const { offset, ...info } = pageWindow(rows.length, page, size);
  return { ...info, rows: rows.slice(offset, offset + size) };
}
