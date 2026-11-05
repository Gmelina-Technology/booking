import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import { bookingPlace, bookingTime, formatInstant, isPast, isRegistration } from "@/lib/event-schedule";
import { formatMoney, type PaymentSettings } from "@/lib/facility";
import { getPublicOwnerById, ownerPath } from "@/lib/owners";
import CancelForm from "./cancel-form";
import PaymentReferenceForm from "./payment-reference-form";
import { getBookingByToken, readSettings, type Booking } from "@/lib/store";
import { facilityNow, formatDate } from "@/lib/time";

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
  const digits = phone.replace(/\D/g, "");
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
  const owner = await getPublicOwnerById(booking.ownerId);
  if (!owner) notFound();
  const activity = await getActivity(owner.id, booking.activitySlug);
  const settings = await readSettings(owner.id);
  const registration = isRegistration(booking);
  const [icon, heading, subheading, color] = registration ? registrationHeader(booking, settings) : header(booking, settings, !!activity?.noDownpayment);
  const now = facilityNow();
  const cancellable =
    booking.status !== "cancelled" &&
    (booking.closesAt
      ? !isPast(booking.closesAt)
      : booking.date > now.date || (booking.date === now.date && booking.startHour > now.hour));
  const contact = owner.profile.phone || owner.profile.email;
  const who = booking.teamName
    ? [
        ["Team", booking.teamName],
        ["Players", (booking.teamPlayers ?? []).join(", ")],
      ]
    : [[registration ? "Spots" : "Players", String(registration ? (booking.spots ?? 1) : booking.players)]];
  const paidUpFront = !!booking.downpayment && booking.downpayment >= booking.total;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className={`px-6 py-8 text-center text-white ${color}`}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/20 text-3xl">{icon}</div>
        <h1 className="mt-4 text-2xl font-bold">{heading}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/90">{subheading}</p>
        <p className="mt-1 text-sm font-medium text-white/80">{owner.profile.name}</p>
        <p className="mt-3 text-white/80">
          Reference <span className="font-mono font-semibold text-white">{booking.id}</span>
        </p>
      </div>
      {booking.status === "awaiting_payment" && <PayNow booking={booking} settings={settings} token={token} />}
      <dl className="divide-y divide-black/5 px-6 text-sm">
        {[
          ...(registration ? [["Event", booking.eventTitle ?? "Event"]] : []),
          ["Activity", `${activity?.emoji ?? ""} ${activity?.name ?? booking.activitySlug}`],
          ...(registration ? [] : [[activity?.resourceLabel ?? "Court", bookingPlace(booking, activity)]]),
          ["Date", formatDate(booking.date, { weekday: "long", month: "long", year: "numeric" })],
          ["Time", bookingTime(booking)],
          ...who,
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
        {!!booking.bookingFee && (
          <>
            <div className="flex justify-between py-3">
              <dt className="text-black/50">Price</dt>
              <dd className="font-medium">{formatMoney(booking.total - booking.bookingFee)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-black/50">Booking fee</dt>
              <dd className="font-medium">{formatMoney(booking.bookingFee)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between py-3">
          <dt className="text-black/50">Total</dt>
          <dd className="font-semibold">{formatMoney(booking.total)}</dd>
        </div>
        {booking.downpayment === 0 && booking.status !== "cancelled" && (
          <div className="flex justify-between py-4 text-base">
            <dt className="font-semibold">Pay at the front desk</dt>
            <dd className="font-bold text-emerald-700">{formatMoney(booking.total)}</dd>
          </div>
        )}
        {paidUpFront && booking.status !== "cancelled" && (
          <div className="flex justify-between py-3">
            <dt className="text-black/50">Payment</dt>
            <dd className="font-medium">{booking.status === "confirmed" ? "Received" : "Due now"}</dd>
          </div>
        )}
        {!!booking.downpayment && !paidUpFront && booking.status !== "cancelled" && (
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
          {booking.status !== "cancelled" && "Please arrive 10 minutes early. "}
          {registration ? "Questions?" : "Need to change the time?"} Contact {owner.profile.name}
          {contact ? ` at ${contact}` : ""} with your reference <span className="font-mono">{booking.id}</span>.
        </p>
        {cancellable && <CancelForm token={token} paid={!!booking.paidAt && !!booking.downpayment} registration={registration} />}
        <p className="text-xs text-black/50">
          Bookmark this page to see your booking again. The link is private, so only share it with people in
          your group.
        </p>
        <Link href={ownerPath(owner.handle, "#activities")} className="inline-block font-semibold text-emerald-700 hover:underline">
          Book another session →
        </Link>
      </div>
    </div>
  );
}

function header(b: Booking, settings: PaymentSettings, noDownpayment: boolean): [string, string, string, string] {
  switch (b.status) {
    case "pending": {
      const next = noDownpayment ? "a confirmation" : "payment instructions";
      return ["⏳", "Request received", `We're checking availability. You'll get an email with ${next} once staff approve your booking. If they can't review it within ${settings.requestWindowHours} hours, the slot is released and we'll email you.`, "bg-blue-600"];
    }
    case "awaiting_payment":
      return ["💳", "Approved: pay to confirm", `Pay the downpayment within ${settings.paymentWindowHours} hours to lock in your slot.`, "bg-amber-600"];
    case "confirmed":
      return ["✓", "You're booked!", b.downpayment === 0 ? "Your slot is confirmed. Pay at the front desk when you arrive." : "Your downpayment is received and your slot is confirmed.", "bg-emerald-700"];
    case "cancelled":
      return ["✕", "Booking cancelled", b.cancelReason ? `Reason: ${b.cancelReason}` : "This booking is no longer active.", "bg-zinc-500"];
  }
}

/** Headings for a hosted-event registration: no request step, so it's waiting for payment or confirmed. */
function registrationHeader(b: Booking, settings: PaymentSettings): [string, string, string, string] {
  const closes = b.closesAt ? ` and before registration closes (${formatInstant(b.closesAt)})` : "";
  switch (b.status) {
    case "pending":
    case "awaiting_payment":
      return ["💳", "Registered: pay to keep your spot", `Pay within ${settings.paymentWindowHours} hours${closes}, or your spot goes to someone else.`, "bg-amber-600"];
    case "confirmed":
      return ["✓", "You're in!", b.downpayment === 0 ? "Your spot is confirmed. Pay at the front desk when you arrive." : "Your payment is received and your spot is confirmed.", "bg-emerald-700"];
    case "cancelled":
      return ["✕", "Registration cancelled", b.cancelReason ? `Reason: ${b.cancelReason}` : "This registration is no longer active.", "bg-zinc-500"];
  }
}

function PayNow({ booking, settings, token }: { booking: Booking; settings: PaymentSettings; token: string }) {
  const account = [settings.accountName, settings.accountNumber].filter(Boolean).join(" · ");
  return (
    <section className="border-b border-black/5 bg-amber-50/60 px-6 py-6 text-center">
      <p className="text-sm text-black/60">{isRegistration(booking) ? "Amount due" : "Downpayment due"}</p>
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
      <PaymentReferenceForm token={token} submitted={booking.paymentRef ?? null} due={booking.downpayment ?? booking.total} />
    </section>
  );
}
