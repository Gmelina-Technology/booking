// Pieces of the Sales page that the staff Overview shows too.

import Link from "next/link";
import { formatMoney } from "@/lib/facility";
import type { MonthSales } from "@/lib/sales";
import { formatDate } from "@/lib/time";

export const monthLabel = (month: string, style: "long" | "short" = "long") =>
  formatDate(`${month}-01`, { weekday: undefined, day: undefined, month: style, year: style === "long" ? "numeric" : undefined });

/** Up or down as a percentage, with an arrow so it never relies on colour alone. */
export function Change({ value, isNew = false }: { value: number | null; isNew?: boolean }) {
  if (value === null) return <span className="font-medium text-black/40">{isNew ? "New" : "No comparison"}</span>;
  const pct = Math.round(value * 100);
  if (pct === 0) return <span className="font-medium text-black/50">No change</span>;
  return (
    <span className={`font-semibold ${pct > 0 ? "text-emerald-700" : "text-red-700"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%<span className="sr-only">{pct > 0 ? " up" : " down"}</span>
    </span>
  );
}

/** A round number just above `max`, for the top of the chart. */
function niceCeiling(max: number) {
  if (max <= 0) return 1000;
  const step = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((n) => n >= max)!;
}

/**
 * Monthly revenue bars. Each bar opens that month on the Sales page; hovering
 * or focusing one shows its figures. Months after `thisMonth` stay empty.
 */
export function RevenueChart({ trend, selected, thisMonth }: { trend: MonthSales[]; selected: string; thisMonth: string }) {
  const top = niceCeiling(Math.max(...trend.map((s) => s.revenue)));
  const ticks = [top, top / 2, 0];
  return (
    <div className="mt-4 flex gap-2">
      <div className="flex h-48 w-12 shrink-0 flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-black/40 sm:h-56" aria-hidden>
        {ticks.map((t) => (
          <span key={t}>{formatMoney(t)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-48 border-b border-black/15 sm:h-56">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-black/10" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-black/10" aria-hidden />
          <ol className="absolute inset-0 flex items-end gap-0.5 sm:gap-1.5">
            {trend.map((s, i) => {
              if (s.month > thisMonth) return <li key={s.month} className="flex-1" />;
              // Tooltips at either end line up with the bar's outer edge so they stay inside the card.
              const align = i < 2 ? "left-0" : i >= trend.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
              const label = `${monthLabel(s.month)}${s.month === thisMonth ? " so far" : ""}: ${formatMoney(s.revenue)} from ${s.bookings} booking${s.bookings === 1 ? "" : "s"}`;
              const height = `${(s.revenue / top) * 100}%`;
              return (
                <li key={s.month} className="group relative flex h-full flex-1 items-end">
                  <Link href={`/app/sales?month=${s.month}`} aria-label={label} className="flex h-full w-full items-end rounded-t outline-offset-2">
                    <span
                      className={`w-full rounded-t transition-colors ${
                        s.month === selected ? "bg-emerald-700" : "bg-emerald-600/35 group-hover:bg-emerald-600/60"
                      } ${s.revenue > 0 ? "min-h-1" : ""}`}
                      style={{ height }}
                    />
                  </Link>
                  <span
                    role="tooltip"
                    style={{ bottom: height }}
                    className={`pointer-events-none absolute ${align} z-10 mb-1.5 hidden w-max max-w-44 rounded-lg bg-black/85 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block`}
                  >
                    <span className="block font-semibold">{formatMoney(s.revenue)}</span>
                    <span className="block text-white/70">
                      {monthLabel(s.month, "short")} {s.month.slice(0, 4)}
                      {s.month === thisMonth ? " so far" : ""} · {s.bookings} booking{s.bookings === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <ol className="mt-1.5 flex gap-0.5 text-center text-[10px] text-black/50 sm:gap-1.5 sm:text-xs" aria-hidden>
          {trend.map((s, i) => (
            <li
              key={s.month}
              className={`min-w-0 flex-1 whitespace-nowrap ${s.month === selected ? "font-semibold text-black/80" : s.month > thisMonth ? "text-black/25" : ""}`}
            >
              {monthLabel(s.month, "short")}
              {(i === 0 || s.month.endsWith("-01")) && <span className="block text-black/35">{s.month.slice(0, 4)}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
