import Link from "next/link";
import { formatHour, formatHourRange, type Activity } from "@/lib/facility";
import type { Booking } from "@/lib/store";
import { addDays, formatDate, monthWeeks, startOfWeek } from "@/lib/time";

// Calendar views of the bookings page. Every booking links to `?booking=<id>`,
// which opens its details and actions (rendered by page.tsx).

/** Pill and block colours by status: tentative orange, unpaid pink, confirmed green. */
export const statusTone: Record<Booking["status"], { label: string; cls: string; dot: string }> = {
  pending: { label: "Tentative (new request)", cls: "bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100", dot: "bg-orange-400" },
  awaiting_payment: { label: "Awaiting payment", cls: "bg-pink-50 text-pink-700 ring-pink-200 hover:bg-pink-100", dot: "bg-pink-400" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", cls: "bg-black/[0.03] text-black/40 ring-black/10 line-through hover:bg-black/5", dot: "bg-black/25" },
};

export type CalendarProps = {
  /** Already filtered by space, past and cancelled. */
  bookings: Booking[];
  today: string;
  date: string;
  /** Link that opens a booking's details. */
  bookingHref: (id: string) => string;
  /** Link to the day view of a date. */
  dayHref: (date: string) => string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LIMIT = 3;

function byStart(a: Booking, b: Booking) {
  return a.startHour - b.startHour || a.name.localeCompare(b.name);
}

function groupByDate(bookings: Booking[]) {
  const map = new Map<string, Booking[]>();
  for (const b of bookings) map.set(b.date, [...(map.get(b.date) ?? []), b]);
  for (const list of map.values()) list.sort(byStart);
  return map;
}

function Pill({ b, href }: { b: Booking; href: string }) {
  const tone = statusTone[b.status];
  return (
    <Link
      href={href}
      scroll={false}
      title={`${b.name} · ${formatHourRange(b.startHour, b.hours)} · ${tone.label}`}
      className={`block rounded-md px-1.5 py-1 text-left ring-1 ring-inset ${tone.cls}`}
    >
      <span className="block truncate text-xs font-medium">
        {b.status === "pending" && "Tentative: "}
        {b.name}
      </span>
      <span className="block truncate text-[10px] opacity-80">{formatHourRange(b.startHour, b.hours)}</span>
    </Link>
  );
}

export function MonthGrid({ bookings, today, date, bookingHref, dayHref }: CalendarProps) {
  const byDate = groupByDate(bookings);
  const month = date.slice(0, 7);
  return (
    <div className="grid grid-cols-7">
      {WEEKDAYS.map((d) => (
        <div key={d} className="border-b border-black/5 bg-black/[0.02] py-2 text-center text-xs font-medium text-black/50">
          {d}
        </div>
      ))}
      {monthWeeks(date)
        .flat()
        .map((day, i) => {
          const list = byDate.get(day) ?? [];
          const inMonth = day.slice(0, 7) === month;
          return (
            <div
              key={day}
              className={`min-h-28 min-w-0 space-y-1 border-b border-black/5 p-1.5 ${i % 7 ? "border-l" : ""} ${inMonth ? "" : "bg-black/[0.02]"}`}
            >
              <Link
                href={dayHref(day)}
                scroll={false}
                aria-label={formatDate(day, { weekday: "long", month: "long" })}
                className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${
                  day === today
                    ? "bg-emerald-600 font-semibold text-white"
                    : inMonth
                      ? "text-black/80 hover:bg-black/5"
                      : "text-black/30 hover:bg-black/5"
                }`}
              >
                {Number(day.slice(8))}
              </Link>
              {list.slice(0, MONTH_LIMIT).map((b) => (
                <Pill key={b.id} b={b} href={bookingHref(b.id)} />
              ))}
              {list.length > MONTH_LIMIT && (
                <Link href={dayHref(day)} scroll={false} className="block px-1.5 text-xs font-medium text-emerald-700 hover:underline">
                  +{list.length - MONTH_LIMIT} more
                </Link>
              )}
            </div>
          );
        })}
    </div>
  );
}

const ROW = 52; // px per hour in the time grids

/** First and last hour to draw: opening hours of the shown spaces, widened to fit every booking. */
export function hourRange(activities: Activity[], bookings: Booking[]): [number, number] {
  let start = Math.min(24, ...activities.map((a) => a.openHour), ...bookings.map((b) => b.startHour));
  let end = Math.max(0, ...activities.map((a) => a.closeHour), ...bookings.map((b) => b.startHour + b.hours));
  if (start >= end) [start, end] = [6, 22];
  return [start, end];
}

/** Places overlapping bookings side by side: each gets a lane index and the lane count of its cluster. */
function lanes(list: Booking[]) {
  const out = new Map<string, { lane: number; of: number }>();
  let cluster: { b: Booking; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const of = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.set(c.b.id, { lane: c.lane, of });
    cluster = [];
  };
  for (const b of [...list].sort(byStart)) {
    if (b.startHour >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.b.startHour + c.b.hours > b.startHour).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ b, lane });
    clusterEnd = Math.max(clusterEnd, b.startHour + b.hours);
  }
  flush();
  return out;
}

function Block({ b, href, top, lane = 0, of = 1, sub }: { b: Booking; href: string; top: number; lane?: number; of?: number; sub?: string }) {
  const tone = statusTone[b.status];
  return (
    <Link
      href={href}
      scroll={false}
      title={`${b.name} · ${formatHourRange(b.startHour, b.hours)}${sub ? ` · ${sub}` : ""} · ${tone.label}`}
      className={`absolute overflow-hidden rounded-lg px-1.5 py-1 ring-1 ring-inset ${tone.cls}`}
      style={{
        top: (b.startHour - top) * ROW + 2,
        height: b.hours * ROW - 4,
        left: `calc(${(lane / of) * 100}% + 2px)`,
        width: `calc(${100 / of}% - 4px)`,
      }}
    >
      <span className="block truncate text-xs font-semibold">{b.name}</span>
      <span className="block truncate text-[10px] opacity-80">{formatHourRange(b.startHour, b.hours)}</span>
      {sub && <span className="block truncate text-[10px] opacity-70">{sub}</span>}
    </Link>
  );
}

function HourLabels({ range: [start, end] }: { range: [number, number] }) {
  return (
    <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-black/5 bg-white">
      {Array.from({ length: end - start }, (_, i) => (
        <div key={i} className="relative text-right text-[10px] text-black/40" style={{ height: ROW }}>
          <span className="absolute right-1.5 -top-1.5 whitespace-nowrap bg-white px-0.5">{i === 0 ? "" : formatHour(start + i).replace(":00", "")}</span>
        </div>
      ))}
    </div>
  );
}

function HourLines({ range: [start, end], nowHour }: { range: [number, number]; nowHour: number | null }) {
  return (
    <>
      {Array.from({ length: end - start }, (_, i) => (
        <div key={i} className="border-b border-black/5" style={{ height: ROW }} />
      ))}
      {nowHour !== null && nowHour >= start && nowHour < end && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-emerald-500" style={{ top: (nowHour - start) * ROW }} />
      )}
    </>
  );
}

/** Seven day columns with bookings placed by hour. */
export function WeekGrid({ bookings, today, date, bookingHref, dayHref, range, nowHour, courtName }: CalendarProps & TimeGridExtras) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const byDate = groupByDate(bookings);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px]">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <Link
            key={day}
            href={dayHref(day)}
            scroll={false}
            className="flex-1 border-b border-l border-black/5 bg-black/[0.02] py-2 text-center text-xs text-black/50 hover:text-black"
          >
            {WEEKDAYS[days.indexOf(day)]}{" "}
            <span className={`ml-0.5 inline-flex size-6 items-center justify-center rounded-full text-sm ${day === today ? "bg-emerald-600 font-semibold text-white" : "text-black/80"}`}>
              {Number(day.slice(8))}
            </span>
          </Link>
        ))}
      </div>
      <div className="flex min-w-[720px] pt-2">
        <HourLabels range={range} />
        {days.map((day) => {
          const list = byDate.get(day) ?? [];
          const placed = lanes(list);
          return (
            <div key={day} className="relative flex-1 border-l border-black/5">
              <HourLines range={range} nowHour={day === today ? nowHour : null} />
              {list.map((b) => (
                <Block key={b.id} b={b} href={bookingHref(b.id)} top={range[0]} {...placed.get(b.id)} sub={courtName(b)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type TimeGridExtras = {
  range: [number, number];
  /** Current hour, drawn as a line on today's column. */
  nowHour: number | null;
  /** "Pickleball · Court 2" for a booking. */
  courtName: (b: Booking) => string;
};

export type Column = { activity: Activity; resourceId: string; name: string };

/** One day, one column per court: the phone layout, and the desktop Day view. */
export function DayTimeline({
  bookings,
  today,
  date,
  bookingHref,
  range,
  nowHour,
  columns,
}: Omit<CalendarProps, "dayHref"> & Omit<TimeGridExtras, "courtName"> & { columns: Column[] }) {
  const onDay = bookings.filter((b) => b.date === date);
  const multiActivity = new Set(columns.map((c) => c.activity.slug)).size > 1;
  if (columns.length === 0) return <p className="p-10 text-center text-sm text-black/50">No spaces yet. Add one under Activities.</p>;
  return (
    <div className="max-h-[70vh] overflow-auto">
      <div className="sticky top-0 z-20 flex w-max min-w-full bg-white">
        <div className="sticky left-0 z-10 w-14 shrink-0 border-b border-black/5 bg-white" />
        {columns.map((c) => (
          <div key={`${c.activity.slug}/${c.resourceId}`} className="w-28 flex-1 shrink-0 border-b border-l border-black/5 px-1 py-2 text-center">
            <p className="truncate text-xs font-medium">{c.name}</p>
            {multiActivity && (
              <p className="truncate text-[10px] text-black/40">
                {c.activity.emoji} {c.activity.name}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex w-max min-w-full pt-2">
        <HourLabels range={range} />
        {columns.map((c) => {
          const list = onDay.filter((b) => b.activitySlug === c.activity.slug && b.resourceId === c.resourceId);
          // Cancelled bookings can share a court-hour with a live one; the column splits then.
          const placed = lanes(list);
          return (
            <div key={`${c.activity.slug}/${c.resourceId}`} className="relative w-28 flex-1 shrink-0 border-l border-black/5">
              <HourLines range={range} nowHour={date === today ? nowHour : null} />
              {list.map((b) => (
                <Block key={b.id} b={b} href={bookingHref(b.id)} top={range[0]} {...placed.get(b.id)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Phone header: the week around the selected day, one tap per day. */
export function DayStrip({ date, today, dayHref, counts }: { date: string; today: string; dayHref: (d: string) => string; counts: Map<string, number> }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const arrow = "flex w-8 shrink-0 items-center justify-center rounded-lg text-black/50 hover:bg-black/5 hover:text-black";
  return (
    <div className="flex items-stretch gap-1">
      <Link href={dayHref(addDays(start, -7))} scroll={false} className={arrow} aria-label="Previous week">
        ‹
      </Link>
      <div className="w-12 shrink-0 self-center text-center leading-tight">
        <p className="text-[10px] text-black/40">{date.slice(0, 4)}</p>
        <p className="text-sm font-semibold">{formatDate(date, { weekday: undefined, day: undefined, month: "short" })}</p>
      </div>
      {days.map((day, i) => {
        const selected = day === date;
        return (
          <Link
            key={day}
            href={dayHref(day)}
            scroll={false}
            aria-current={selected ? "date" : undefined}
            className={`flex flex-1 flex-col items-center rounded-xl py-1.5 ${selected ? "bg-emerald-700 text-white" : "hover:bg-black/5"}`}
          >
            <span className={`text-[10px] ${selected ? "text-white/80" : "text-black/40"}`}>{WEEKDAYS[i][0]}</span>
            <span className={`text-sm font-semibold ${!selected && day === today ? "text-emerald-700" : ""}`}>{Number(day.slice(8))}</span>
            <span className={`mt-0.5 size-1 rounded-full ${counts.get(day) ? (selected ? "bg-lime-300" : "bg-emerald-500") : "bg-transparent"}`} />
          </Link>
        );
      })}
      <Link href={dayHref(addDays(start, 7))} scroll={false} className={arrow} aria-label="Next week">
        ›
      </Link>
    </div>
  );
}

export function Legend({ showCancelled }: { showCancelled: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
      {(Object.keys(statusTone) as Booking["status"][])
        .filter((s) => showCancelled || s !== "cancelled")
        .map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${statusTone[s].dot}`} />
            {statusTone[s].label}
          </span>
        ))}
    </div>
  );
}
