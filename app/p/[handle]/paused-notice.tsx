import { connection } from "next/server";
import { isPaused, type PublicOwner } from "@/lib/owners";
import { facilityNow, formatDate } from "@/lib/time";

/** Whether the business has paused its page today, so it shows <PausedNotice> instead of taking requests. */
export async function pausedNow(owner: PublicOwner): Promise<boolean> {
  if (!owner.pause) return false;
  await connection();
  return isPaused(owner.pause, facilityNow().date);
}

/** What customers see in place of booking while the business has paused its page. */
export default function PausedNotice({ owner }: { owner: PublicOwner }) {
  const { profile, pause } = owner;
  const contact = profile.phone || profile.email;
  return (
    <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 shadow-sm">
      <p className="text-base font-semibold">{profile.name} isn&apos;t taking bookings right now</p>
      {pause?.message && <p className="mt-2 whitespace-pre-line">{pause.message}</p>}
      <p className="mt-2 text-amber-950/80">
        {pause?.until ? `Online booking opens again on ${formatDate(pause.until, { weekday: "long", year: "numeric" })}.` : "Please check back soon."}
        {contact && ` Questions? Contact them at ${contact}.`} Already booked? Your booking link still works.
      </p>
    </div>
  );
}
