import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { facility, formatHourRange, formatMoney } from "@/lib/facility";
import { getBooking } from "@/lib/store";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Your booking" };

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <BookingDetails params={params} />
      </Suspense>
    </div>
  );
}

async function BookingDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  const activity = await getActivity(booking.activitySlug);
  const resource = activity?.resources.find((r) => r.id === booking.resourceId);
  const cancelled = booking.status === "cancelled";

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className={`px-6 py-8 text-center text-white ${cancelled ? "bg-zinc-500" : "bg-emerald-700"}`}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/20 text-3xl">
          {cancelled ? "✕" : "✓"}
        </div>
        <h1 className="mt-4 text-2xl font-bold">{cancelled ? "Booking cancelled" : "You're booked!"}</h1>
        <p className="mt-1 text-white/80">
          Reference <span className="font-mono font-semibold text-white">{booking.id}</span>
        </p>
      </div>
      <dl className="divide-y divide-black/5 px-6 text-sm">
        {[
          ["Activity", `${activity?.emoji ?? ""} ${activity?.name ?? booking.activitySlug}`],
          [activity?.resourceLabel ?? "Court", resource?.name ?? booking.resourceId],
          ["Date", formatDate(booking.date, { weekday: "long", month: "long", year: "numeric" })],
          ["Time", formatHourRange(booking.startHour, booking.hours)],
          ["Players", String(booking.players)],
          ["Name", booking.name],
          ["Email", booking.email],
          ["Phone", booking.phone],
          ...(booking.notes ? [["Notes", booking.notes]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3">
            <dt className="text-black/50">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between py-4 text-base">
          <dt className="font-semibold">Total (pay at front desk)</dt>
          <dd className="font-bold text-emerald-700">{formatMoney(booking.total)}</dd>
        </div>
      </dl>
      <div className="space-y-3 border-t border-black/5 bg-black/[0.02] px-6 py-5 text-center text-sm text-black/60">
        <p>
          Please arrive 10 minutes early. Need to change or cancel? Call {facility.phone} with your reference.
        </p>
        <Link href="/#activities" className="inline-block font-semibold text-emerald-700 hover:underline">
          Book another session →
        </Link>
      </div>
    </div>
  );
}
