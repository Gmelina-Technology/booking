import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { formatHourRange, formatMoney, platform, type Activity } from "@/lib/facility";
import { releaseOverdueHolds } from "@/lib/holds";
import { holdsSlot, listBookings, readSettings, type Booking } from "@/lib/store";
import { addDays, addMonths, endOfMonth, facilityNow, formatDate, isoWeek, startOfMonth, startOfWeek } from "@/lib/time";
import { DayStrip, DayTimeline, Legend, MonthGrid, WeekGrid, hourRange, type Column } from "./calendar";
import { BookingActions, CopyReference, DayPicker, EraseCustomerButton, ModeSelect, Toolbar } from "./controls";
import { CreateBooking } from "./create-booking";
import { PageHeader } from "./page-header";
import { staffHref, parseQuery, sectionOf, type StaffQuery, type Section, type ViewKey } from "./query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sectionTitles: Record<Section, [string, string]> = {
  inbox: ["Inbox", "Everything waiting on a staff decision."],
  calendar: ["Calendar", "See and manage bookings by day, week or month."],
  bookings: ["All bookings", "Find any booking, filter by status, or check one day's schedule."],
};

/** The Inbox, Calendar and All bookings pages: one bookings view, shown by `section`. */
export function BookingsPage({ searchParams, section }: { searchParams: SearchParams; section: Section }) {
  const [title, subtitle] = sectionTitles[section];
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense
        fallback={
          <>
            <PageHeader title={title} subtitle={subtitle} />
            <div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />
          </>
        }
      >
        <BookingsView searchParams={searchParams} section={section} />
      </Suspense>
    </div>
  );
}

/** Quick filter tabs of the table views. Status tabs list upcoming bookings across all dates. */
const VIEWS: { key: ViewKey; section: Section; label: string; match: ((b: Booking) => boolean) | null; alert: boolean }[] = [
  { key: "requests", section: "inbox", label: "New requests", match: (b) => b.status === "pending", alert: true },
  { key: "verify", section: "inbox", label: "To verify", match: (b) => b.status === "awaiting_payment" && !!b.paymentRef, alert: true },
  { key: "unpaid", section: "inbox", label: "Awaiting payment", match: (b) => b.status === "awaiting_payment" && !b.paymentRef, alert: false },
  { key: "all", section: "bookings", label: "All", match: (b) => b.status !== "cancelled", alert: false },
  { key: "schedule", section: "bookings", label: "By day", match: null, alert: false },
  { key: "confirmed", section: "bookings", label: "Confirmed", match: (b) => b.status === "confirmed", alert: false },
  { key: "cancelled", section: "bookings", label: "Cancelled", match: (b) => b.status === "cancelled", alert: false },
];

const viewHints: Partial<Record<ViewKey, string>> = {
  requests: "Approve to email the customer the payment QR, or decline. Requests not reviewed in time (see Payments & alerts) are declined automatically.",
  verify: "The customer says they've paid. Find the reference in your account, then confirm.",
  unpaid: "Approved and emailed, but no payment reference yet. Released automatically once the payment window passes.",
};

/** What the "New booking" form needs to know about each activity. */
export function bookable(activities: Activity[]) {
  return activities.map((a) => ({
    slug: a.slug,
    name: a.name,
    resourceLabel: a.resourceLabel,
    resources: a.resources,
    openHour: a.openHour,
    closeHour: a.closeHour,
    maxHoursPerBooking: a.maxHoursPerBooking,
    maxPlayers: a.maxPlayers,
    pricePerHour: a.pricePerHour,
  }));
}

async function BookingsView({ searchParams, section }: { searchParams: SearchParams; section: Section }) {
  const sp = await searchParams;
  await connection();
  const owner = await requireOwner();
  const now = facilityNow();
  const today = now.date;
  // Free up unpaid holds past the payment window before showing the schedule.
  await releaseOverdueHolds(owner.id);
  const [activities, all, settings] = await Promise.all([getAllActivities(owner.id), listBookings({ ownerId: owner.id }), readSettings(owner.id)]);
  const activityBySlug = new Map(activities.map((a) => [a.slug, a]));
  const q = parseQuery(sp, today, (slug) => activityBySlug.has(slug), section);
  const inActivity = all.filter((b) => !q.activity || b.activitySlug === q.activity);
  const selected = q.booking ? all.find((b) => b.id === q.booking) : undefined;
  const overdue = overdueIds(all.filter((b) => b.status === "awaiting_payment" && b.date >= today), settings.paymentWindowHours);
  const [title, subtitle] = sectionTitles[section];

  function rowProps(b: Booking, showDate: boolean): RowProps {
    return {
      b,
      activity: activityBySlug.get(b.activitySlug),
      showDate,
      overdueHours: overdue.has(b.id) ? settings.paymentWindowHours : null,
    };
  }

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        <CreateBooking q={q} today={today} activities={bookable(activities)} />
      </PageHeader>
      <Toolbar q={q} today={today} activities={activities.map((a) => ({ slug: a.slug, name: a.name }))} />

      {q.mode === "table" ? (
        <TableView q={q} today={today} bookings={inActivity} rowProps={rowProps} />
      ) : (
        <CalendarView q={q} today={today} nowHour={now.hour} bookings={inActivity} activities={activities} />
      )}

      {selected && <BookingPanel closeHref={staffHref(q, today, { booking: "" })} {...rowProps(selected, true)} />}
    </>
  );
}

function CalendarView({
  q,
  today,
  nowHour,
  bookings,
  activities,
}: {
  q: StaffQuery;
  today: string;
  nowHour: number;
  bookings: Booking[];
  activities: Activity[];
}) {
  const visible = bookings.filter((b) => (q.cancelled || holdsSlot(b)) && (q.past || b.date >= today));
  const href = (changes: Partial<StaffQuery>) => staffHref(q, today, changes);
  const bookingHref = (id: string) => href({ booking: id });
  const dayHref = (date: string) => href({ mode: "day", date });
  const activityName = new Map(activities.map((a) => [a.slug, a]));
  const courtName = (b: Booking) => {
    const a = activityName.get(b.activitySlug);
    return `${a?.name ?? b.activitySlug} · ${a?.resources.find((r) => r.id === b.resourceId)?.name ?? b.resourceId}`;
  };

  // Courts for the day timeline: the chosen space, or every space that's open or has a booking that day.
  const onDay = visible.filter((b) => b.date === q.date);
  const shown = activities.filter((a) => (q.activity ? a.slug === q.activity : a.active || onDay.some((b) => b.activitySlug === a.slug)));
  const columns: Column[] = shown.flatMap((a) => a.resources.map((r) => ({ activity: a, resourceId: r.id, name: r.name })));
  const dayRange = hourRange(shown, onDay);
  const weekStart = startOfWeek(q.date);
  const weekRange = hourRange(
    q.activity ? shown : activities.filter((a) => a.active),
    visible.filter((b) => b.date >= weekStart && b.date <= addDays(weekStart, 6)),
  );

  const unit = q.mode === "month" ? "Month" : q.mode === "week" ? "Week" : "Day";
  const step = (n: number) => (q.mode === "month" ? addMonths(q.date, n) : addDays(q.date, q.mode === "week" ? 7 * n : n));
  const rangeLabel =
    q.mode === "month"
      ? `${formatDate(startOfMonth(q.date), { weekday: undefined, year: "numeric" })} – ${formatDate(endOfMonth(q.date), { weekday: undefined, year: "numeric" })}`
      : q.mode === "week"
        ? `${formatDate(weekStart, { weekday: undefined, year: "numeric" })} – ${formatDate(addDays(weekStart, 6), { weekday: undefined, year: "numeric" })}`
        : formatDate(q.date, { weekday: "long", month: "long", year: "numeric" });
  const counts = new Map<string, number>();
  for (const b of visible) counts.set(b.date, (counts.get(b.date) ?? 0) + 1);
  const navBtn = "px-3 py-2 text-sm font-medium hover:bg-black/[0.03]";

  return (
    <div className="mt-4 rounded-2xl border border-black/5 bg-white shadow-sm">
      {/* Desktop header: today badge, period title, navigation and view selector. */}
      <div className="hidden flex-wrap items-center gap-4 border-b border-black/5 p-4 md:flex">
        <Link
          href={href({ date: today })}
          scroll={false}
          className="flex w-12 flex-col items-center overflow-hidden rounded-xl border border-black/10 text-center"
          title="Go to today"
        >
          <span className="w-full bg-black/[0.03] py-0.5 text-[10px] font-semibold uppercase text-black/50">
            {formatDate(today, { weekday: undefined, day: undefined, month: "short" })}
          </span>
          <span className="py-0.5 text-lg font-bold text-emerald-700">{Number(today.slice(8))}</span>
        </Link>
        <div>
          <p className="flex items-center gap-2 text-lg font-bold">
            {formatDate(q.date, { weekday: undefined, day: undefined, month: "long", year: "numeric" })}
            <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-xs font-medium text-black/60">Week {isoWeek(q.date)}</span>
          </p>
          <p className="text-xs text-black/50">{rangeLabel}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <nav className="flex divide-x divide-black/10 overflow-hidden rounded-lg border border-black/10" aria-label={`Change ${unit.toLowerCase()}`}>
            <Link href={href({ date: step(-1) })} scroll={false} className={navBtn}>
              ‹ Prev {unit}
            </Link>
            <Link href={href({ date: today })} scroll={false} className={`${navBtn} text-black/50`}>
              This {unit}
            </Link>
            <Link href={href({ date: step(1) })} scroll={false} className={navBtn}>
              Next {unit} ›
            </Link>
          </nav>
          <ModeSelect q={q} today={today} />
        </div>
      </div>

      <div className="hidden md:block">
        {q.mode === "month" && <MonthGrid bookings={visible} today={today} date={q.date} bookingHref={bookingHref} dayHref={dayHref} />}
        {q.mode === "week" && (
          <WeekGrid
            bookings={visible}
            today={today}
            date={q.date}
            bookingHref={bookingHref}
            dayHref={dayHref}
            range={weekRange}
            nowHour={nowHour}
            courtName={courtName}
          />
        )}
        {q.mode === "day" && (
          <DayTimeline bookings={visible} today={today} date={q.date} bookingHref={bookingHref} range={dayRange} nowHour={nowHour} columns={columns} />
        )}
      </div>

      {/* Phones: a day strip, space chips and the day's timeline, one column per court. */}
      <div className="md:hidden">
        <div className="space-y-3 border-b border-black/5 p-3">
          <DayStrip date={q.date} today={today} dayHref={(date) => href({ date })} counts={counts} />
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3">
            {[{ slug: "", name: "All spaces" }, ...activities].map((a) => (
              <Link
                key={a.slug}
                href={href({ activity: a.slug })}
                scroll={false}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  q.activity === a.slug ? "bg-emerald-700 text-white" : "bg-black/5 text-black/60"
                }`}
              >
                {a.name}
              </Link>
            ))}
          </div>
        </div>
        <DayTimeline bookings={visible} today={today} date={q.date} bookingHref={bookingHref} range={dayRange} nowHour={nowHour} columns={columns} />
      </div>

      <div className="border-t border-black/5 px-4 py-3">
        <Legend showCancelled={q.cancelled} />
      </div>
    </div>
  );
}

function TableView({
  q,
  today,
  bookings,
  rowProps,
}: {
  q: StaffQuery;
  today: string;
  bookings: Booking[];
  rowProps: (b: Booking, showDate: boolean) => RowProps;
}) {
  const tabs = VIEWS.filter((v) => v.section === sectionOf(q));
  const view = tabs.find((v) => v.key === q.view) ?? tabs[0];
  const listed = q.past ? bookings : bookings.filter((b) => b.date >= today);
  const isSchedule = view.match === null;
  const rows = view.match
    ? listed.filter(view.match).sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour)
    : bookings.filter((b) => b.date === q.date).sort((a, b) => a.startHour - b.startHour);
  const active = rows.filter(holdsSlot);
  const confirmed = rows.filter((b) => b.status === "confirmed");

  return (
    <>
      {/* The baseline is an inset shadow so the active tab's border can cover it without
          overflowing the scroll container (which would add a vertical scrollbar). */}
      <nav
        className="mt-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_rgb(0_0_0/0.1)]"
        aria-label="Filter bookings"
      >
        {tabs.map((v) => {
          const selected = v.key === view.key;
          const count = v.match ? listed.filter(v.match).length : null;
          return (
            <Link
              key={v.key}
              href={staffHref(q, today, { view: v.key })}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                selected ? "border-emerald-700 text-emerald-800" : "border-transparent text-black/60 hover:text-black"
              }`}
            >
              {v.label}
              {count !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    v.alert && count > 0
                      ? "bg-blue-600 font-semibold text-white"
                      : selected
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-black/5 text-black/50"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {isSchedule ? (
        <DayPicker q={q} today={today} />
      ) : (
        <p className="mt-4 text-sm text-black/50">{q.past ? "All bookings, including past dates" : "Upcoming bookings, all dates"}</p>
      )}
      {viewHints[view.key] && <p className="mt-3 text-sm text-black/50">{viewHints[view.key]}</p>}

      {isSchedule && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Active bookings" value={String(active.length)} />
          <Stat label="Court-hours booked" value={String(active.reduce((n, b) => n + b.hours, 0))} />
          <Stat label="Confirmed revenue" value={formatMoney(confirmed.reduce((n, b) => n + b.total, 0))} />
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-black/5 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-black/50">
            {isSchedule ? `No bookings for ${formatDate(q.date, { month: "long" })}.` : q.past ? "No bookings here." : "No upcoming bookings here."}
          </p>
        ) : (
          <>
            {/* Phones and tablets: one stacked card per booking. */}
            <ul className="divide-y divide-black/5 lg:hidden">
              {rows.map((b) => (
                <li key={b.id}>
                  <BookingCard {...rowProps(b, !isSchedule)} />
                </li>
              ))}
            </ul>
            {/* Desktop: one compact row per booking. No overflow container, so the actions menu isn't clipped. */}
            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-black/50">
                <tr>
                  <th className="py-3 pl-3 pr-2 font-medium">Reference</th>
                  <th className="px-3 py-3 font-medium">{isSchedule ? "Time" : "When"}</th>
                  <th className="px-3 py-3 font-medium">Activity</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Payment</th>
                  <th className="py-3 pl-3 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((b) => (
                  <BookingRow key={b.id} {...rowProps(b, !isSchedule)} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

/** Side panel with one booking's details and actions, opened from the calendar (?booking=<id>). */
function BookingPanel({ closeHref, ...props }: RowProps & { closeHref: string }) {
  const { b } = props;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="booking-panel-title">
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-black/30" aria-label="Close booking details" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-black/40">Booking {b.id}</p>
            <h2 id="booking-panel-title" className="truncate text-lg font-bold">
              {b.name}
            </h2>
          </div>
          <Link href={closeHref} scroll={false} className="rounded-lg px-2 py-1 text-black/40 hover:bg-black/5 hover:text-black" aria-label="Close">
            ✕
          </Link>
        </div>
        <BookingCard {...props} />
        <dl className="mx-4 mb-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-black/[0.02] p-3 text-xs text-black/60">
          <dt>Requested</dt>
          <dd className="text-right">{new Date(b.createdAt).toLocaleString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium", timeStyle: "short" })}</dd>
          {b.cancelReason && (
            <>
              <dt>Cancel reason</dt>
              <dd className="text-right">{b.cancelReason}</dd>
            </>
          )}
          {b.erasedAt && (
            <>
              <dt>Customer details erased</dt>
              <dd className="text-right">{new Date(b.erasedAt).toLocaleString(platform.locale, { timeZone: platform.timeZone, dateStyle: "medium" })}</dd>
            </>
          )}
        </dl>
        {/* Only once the booking is cancelled or over, so an active booking can't lose its contact details. */}
        {!b.erasedAt && (b.status === "cancelled" || b.date < facilityNow().date) && (
          <div className="mx-4 mb-4">
            <EraseCustomerButton id={b.id} />
          </div>
        )}
      </aside>
    </div>
  );
}

/** Bookings approved longer ago than the payment window. Request-time only (after connection()). */
export function overdueIds(bookings: Booking[], windowHours: number) {
  const cutoff = Date.now() - windowHours * 3600_000;
  return new Set(bookings.filter((b) => b.approvedAt && Date.parse(b.approvedAt) < cutoff).map((b) => b.id));
}

export type RowProps = {
  b: Booking;
  activity?: Activity;
  /** Status tabs span many days, so they show the date as well as the time. */
  showDate: boolean;
  /** The payment window in hours, when this booking is past it. */
  overdueHours: number | null;
};

function BookingRow({ b, activity, showDate, overdueHours }: RowProps) {
  return (
    <tr className={`align-top ${b.status === "cancelled" ? "text-black/40" : ""}`}>
      <td className="py-2.5 pl-3 pr-2">
        <CopyReference id={b.id} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-medium">
        {showDate && <p>{formatDate(b.date)}</p>}
        <p className={showDate ? "text-xs font-normal text-black/60" : ""}>{formatHourRange(b.startHour, b.hours)}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Court b={b} activity={activity} />
      </td>
      {/* w-full + max-w-0: take the leftover width and truncate long text instead of widening the table. */}
      <td className="w-full max-w-0 px-3 py-3">
        <Customer b={b} />
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={b.status} />
      </td>
      <td className="px-3 py-3">
        <Payment b={b} overdueHours={overdueHours} />
      </td>
      <td className="py-2.5 pl-3 pr-4">
        <BookingActions id={b.id} status={b.status} />
      </td>
    </tr>
  );
}

function BookingCard({ b, activity, showDate, overdueHours }: RowProps) {
  return (
    <div className={`space-y-3 p-4 text-sm ${b.status === "cancelled" ? "text-black/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {showDate && <>{formatDate(b.date)} · </>}
            {formatHourRange(b.startHour, b.hours)}
          </p>
          <p className="truncate">
            <Court b={b} activity={activity} />
          </p>
        </div>
        <Status b={b} className="items-end" />
      </div>
      <Customer b={b} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Payment b={b} overdueHours={overdueHours} />
        <div className="ml-auto">
          <BookingActions id={b.id} status={b.status} />
        </div>
      </div>
    </div>
  );
}

export function Court({ b, activity }: { b: Booking; activity?: Activity }) {
  const resource = activity?.resources.find((r) => r.id === b.resourceId);
  return (
    <>
      {activity?.name ?? b.activitySlug} <span className="text-black/50">· {resource?.name ?? b.resourceId}</span>
    </>
  );
}

function Customer({ b }: { b: Booking }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium" title={`${b.name} · ${b.players} players`}>
        {b.name} <span className="font-normal text-black/50">· {b.players} players</span>
      </p>
      {/* Staff-created bookings may have no phone or email. */}
      <p className="truncate text-xs text-black/50" title={[b.phone, b.email].filter(Boolean).join(" · ")}>
        {b.phone && (
          <a href={`tel:${b.phone}`} className="hover:text-emerald-700 hover:underline">
            {b.phone}
          </a>
        )}
        {b.phone && b.email && " · "}
        {b.email && (
          <a href={`mailto:${b.email}`} className="hover:text-emerald-700 hover:underline">
            {b.email}
          </a>
        )}
      </p>
      {b.notes && (
        // One line until clicked; the full note is also the tooltip.
        <details className="group mt-0.5 text-xs italic text-black/50">
          <summary
            title={b.notes}
            className="block cursor-pointer list-none truncate hover:text-black/70 group-open:whitespace-normal [&::-webkit-details-marker]:hidden"
          >
            “{b.notes}”
          </summary>
        </details>
      )}
    </div>
  );
}

function Status({ b, className = "items-start" }: { b: Booking; className?: string }) {
  return (
    <div className={`flex shrink-0 flex-col gap-1 ${className}`}>
      <StatusBadge status={b.status} />
      <CopyReference id={b.id} />
    </div>
  );
}

function Payment({ b, overdueHours }: { b: Booking; overdueHours: number | null }) {
  const lastEmail = b.emails?.at(-1);
  const emailLabel = lastEmail && `${lastEmail.kind.replace("_", " ")} email`;
  return (
    <div className="space-y-1 text-xs">
      <p className="whitespace-nowrap">
        Total <span className="font-semibold">{formatMoney(b.total)}</span>
        {b.downpayment !== undefined && (
          <>
            {" "}
            <span className="text-black/30">·</span> Down <span className="font-semibold">{formatMoney(b.downpayment)}</span>
          </>
        )}
      </p>
      {(b.paymentRef || lastEmail || overdueHours !== null) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {b.paymentRef && (
            <span
              className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200"
              title="Payment reference the customer entered"
            >
              Customer ref <span className="font-mono font-semibold">{b.paymentRef}</span>
            </span>
          )}
          {lastEmail && (
            <span
              className={`whitespace-nowrap ${lastEmail.ok ? "text-black/40" : "font-semibold text-red-700"}`}
              title={lastEmail.detail ? `${emailLabel}: ${lastEmail.detail}` : emailLabel}
            >
              {lastEmail.ok ? "✓" : "✕"} {emailLabel}
              {lastEmail.ok ? "" : " failed"}
            </span>
          )}
          {overdueHours !== null && (
            <span className="whitespace-nowrap font-semibold text-red-700">Past the {overdueHours}h payment window</span>
          )}
        </div>
      )}
    </div>
  );
}

// Same hues as the calendar pills (statusTone in ./calendar).
const statusStyles: Record<Booking["status"], [string, string]> = {
  pending: ["New request", "bg-orange-100 text-orange-800"],
  awaiting_payment: ["Awaiting payment", "bg-pink-100 text-pink-800"],
  confirmed: ["Confirmed", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Cancelled", "bg-black/5 text-black/50"],
};

export function StatusBadge({ status }: { status: Booking["status"] }) {
  const [label, cls] = statusStyles[status];
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <p className="text-sm text-black/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
