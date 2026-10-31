"use server";

import { refresh } from "next/cache";
import { randomBytes } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/auth";
import type { FeeRate } from "@/lib/fees";
import { getOwnerById, updateFeeSchedule } from "@/lib/store";
import { addDays, facilityNow, isValidDate } from "@/lib/time";

// Platform-admin only: each action starts with requirePlatformAdmin().
// Rates are never edited in place. A change is a new version that starts
// tomorrow at the earliest, so fees already charged stay as they were.

export type FeeResult = { ok: boolean; message: string };

const MAX_AMOUNT = 100_000;

/** A whole number of pesos, null when empty, undefined when invalid. */
function amount(raw: FormDataEntryValue | null): number | null | undefined {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT ? n : undefined;
}

export async function addFeeRate(form: FormData): Promise<FeeResult> {
  const admin = await requirePlatformAdmin();
  const tomorrow = addDays(facilityNow().date, 1);

  const scope = form.get("scope") === "owner" ? "owner" : "platform";
  const ratePerHour = amount(form.get("ratePerHour"));
  const capPerBooking = amount(form.get("capPerBooking"));
  const effectiveFrom = String(form.get("effectiveFrom") ?? "");
  const until = String(form.get("until") ?? "").trim() || undefined;
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || undefined;

  if (ratePerHour === null || ratePerHour === undefined) return { ok: false, message: "Enter the rate per hour as a whole number of pesos." };
  if (capPerBooking === undefined) return { ok: false, message: "The cap must be a whole number of pesos, or empty for no cap." };
  if (!isValidDate(effectiveFrom) || effectiveFrom < tomorrow)
    return { ok: false, message: "Rates can start tomorrow at the earliest, so fees already charged don't change." };

  let ownerId: string | undefined;
  if (scope === "owner") {
    ownerId = String(form.get("ownerId") ?? "");
    if (!ownerId || !(await getOwnerById(ownerId))) return { ok: false, message: "Pick the partner for this promo." };
    if (until && (!isValidDate(until) || until < effectiveFrom)) return { ok: false, message: "The promo's end date must be on or after its start." };
  }

  const rate: FeeRate = {
    id: randomBytes(6).toString("hex"),
    scope,
    ...(ownerId && { ownerId }),
    ratePerHour,
    capPerBooking,
    effectiveFrom,
    ...(scope === "owner" && until && { until }),
    ...(note && { note }),
    createdAt: new Date().toISOString(),
    createdBy: admin.email,
  };
  await updateFeeSchedule((doc) => {
    doc.rates.push(rate);
  });
  refresh();
  return { ok: true, message: scope === "owner" ? "Promo rate saved." : "New platform rate saved." };
}

/**
 * Ends a promo after today's bookings. A promo that hasn't started yet is
 * removed, since it never applied to anything.
 */
export async function endPromo(id: string): Promise<FeeResult> {
  await requirePlatformAdmin();
  const today = facilityNow().date;
  const result = await updateFeeSchedule((doc): FeeResult => {
    const promo = doc.rates.find((r) => r.id === id && r.scope === "owner");
    if (!promo) return { ok: false, message: "Promo not found." };
    if (promo.effectiveFrom > today) {
      doc.rates = doc.rates.filter((r) => r !== promo);
      return { ok: true, message: "Promo removed before it started." };
    }
    if (promo.until && promo.until <= today) return { ok: false, message: "That promo has already ended." };
    promo.until = today;
    return { ok: true, message: "Promo ends after today." };
  });
  refresh();
  return result;
}

/** Removes a platform rate that hasn't started yet. Rates in effect or past stay, as history. */
export async function cancelScheduledRate(id: string): Promise<FeeResult> {
  await requirePlatformAdmin();
  const today = facilityNow().date;
  const result = await updateFeeSchedule((doc): FeeResult => {
    const rate = doc.rates.find((r) => r.id === id && r.scope === "platform");
    if (!rate) return { ok: false, message: "Rate not found." };
    if (rate.effectiveFrom <= today) return { ok: false, message: "That rate is already in effect, so it stays in the history." };
    doc.rates = doc.rates.filter((r) => r !== rate);
    return { ok: true, message: "Scheduled rate cancelled." };
  });
  refresh();
  return result;
}
