import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { facility, formatHourRange, formatMoney, type PaymentSettings } from "@/lib/facility";
import PaymentReferenceForm from "./payment-reference-form";
import { getBookingByToken, readSettings, type Booking } from "@/lib/store";
import { formatDate } from "@/lib/time";

// The URL is the only thing protecting this page, so keep it out of search
// engines and out of Referer headers sent to other sites.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** "juan.delacruz@gmail.com" -> "j••••••••••@gmail.com" */
function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

/** "0917 123 4567" -> "•••• •••• 567" style: keep only the last 3 digits. */
function maskPhone(phone: string) {
  const digits = phone.replace(/D/g, "");
  return `${"•".repeat(Math.max(digits.length - 3, 4))}${digits.slice(-3)}`;
}

export default function BookingPage({ params }: PageProps<"/bookings/[token]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <BookingDetails params={params} />
      </Suspense>
    </div>
  );
}

async function BookingDetails({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);
  if (!booking) notFound();
  const activity = await getActivity(booking.activitySlug);
  const resource = activity?.resources.find((r) => r.id === booking.resourceId);
  const settings = await readSettings();
  const [icon, heading, subheading, color] = header(booking, settings);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className={`px-6 py-8 text-center text-white ${color}`}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/20 text-3xl">{icon}</div>
        <h1 className="mt-4 text-2xl font-bold">{heading}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/90">{subheading}</p>
        <p className="mt-3 text-white/80">
          Reference <span className="font-mono font-semibold text-white">{booking.id}</span>
        </p>
      </div>
      {booking.status === "awaiting_payment" && <PayNow booking={booking} settings={settings} token={token} />}
      <dl className="divide-y divide-black/5 px-6 text-sm">
        {[
          ["Activity", `${activity?.emoji ?? ""} ${activity?.name ?? booking.activitySlug}`],
          [activity?.resourceLabel ?? "Court", resource?.name ?? booking.resourceId],
          ["Date", formatDate(booking.date, { weekday: "long", month: "long", year: "numeric" })],
          ["Time", formatHourRange(booking.startHour, booking.hours)],
          ["Players", String(booking.players)],
          ["Name", booking.name],
          ["Email", maskEmail(booking.email)],
          ["Phone", maskPhone(booking.phone)],
          ...(booking.notes ? [["Notes", booking.notes]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3">
            <dt className="text-black/50">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between py-3">
          <dt className="text-black/50">Total</dt>
          <dd className="font-semibold">{formatMoney(booking.total)}</dd>
        </div>
        {booking.downpayment !== undefined && booking.status !== "cancelled" && (
          <>
            <div className="flex justify-between py-3">
              <dt className="text-black/50">Downpayment</dt>
              <dd className="font-medium">
                {formatMoney(booking.downpayment)} {booking.status === "confirmed" ? "· received" : "· due now"}
              </dd>
            </div>
            <div className="flex justify-between py-4 text-base">
              <dt className="font-semibold">Balance at the front desk</dt>
              <dd className="font-bold text-emerald-700">{formatMoney(booking.total - booking.downpayment)}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="space-y-3 border-t border-black/5 bg-black/[0.02] px-6 py-5 text-center text-sm text-black/60">
        <p>
          Please arrive 10 minutes early. Need to change or cancel? Call {facility.phone} with your reference.
        </p>
        <p className="text-xs text-black/50">
          Bookmark this page to see your booking again. The link is private, so only share it with people in
          your group.
        </p>
        <Link href="/#activities" className="inline-block font-semibold text-emerald-700 hover:underline">
          Book another session →
        </Link>
      </div>
    </div>
  );
}

function header(b: Booking, settings: PaymentSettings): [string, string, string, string] {
  switch (b.status) {
    case "pending":
      return ["⏳", "Request received", "We're checking availability. You'll get an email with payment instructions once staff approve your booking.", "bg-blue-600"];
    case "awaiting_payment":
      return ["💳", "Approved: pay to confirm", `Pay the downpayment within ${settings.paymentWindowHours} hours to lock in your slot.`, "bg-amber-600"];
    case "confirmed":
      return ["✓", "You're booked!", "Your downpayment is received and your slot is confirmed.", "bg-emerald-700"];
    case "cancelled":
      return ["✕", "Booking cancelled", b.cancelReason ? `Reason: ${b.cancelReason}` : "This booking is no longer active.", "bg-zinc-500"];
  }
}

function PayNow({ booking, settings, token }: { booking: Booking; settings: PaymentSettings; token: string }) {
  const account = [settings.accountName, settings.accountNumber].filter(Boolean).join(" · ");
  return (
    <section className="border-b border-black/5 bg-amber-50/60 px-6 py-6 text-center">
      <p className="text-sm text-black/60">Downpayment due</p>
      <p className="text-3xl font-bold">{formatMoney(booking.downpayment ?? booking.total)}</p>
      <p className="mt-1 text-sm text-black/60">via {settings.methodName}</p>
      {settings.qrPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded QR, already sized
        <img
          src={`/uploads/${settings.qrPhoto}`}
          alt={`${settings.methodName} payment QR code`}
          className="mx-auto mt-4 w-56 rounded-xl border border-black/10 bg-white"
        />
      )}
      {account && <p className="mt-3 font-semibold">{account}</p>}
      <p className="mx-auto mt-3 max-w-sm text-sm text-black/60">{settings.instructions}</p>
      <p className="mt-2 text-sm text-black/60">
        Put <span className="font-mono font-semibold text-black">{booking.id}</span> in the payment note.
      </p>
      <PaymentReferenceForm token={token} submitted={booking.paymentRef ?? null} />
    </section>
  );
}
