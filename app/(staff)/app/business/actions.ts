"use server";

import { refresh, updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth";
import type { BusinessProfile } from "@/lib/facility";
import { isLatLng, type LatLng } from "@/lib/geo";
import { geocode } from "@/lib/geocode";
import { isPaused, OWNERS_TAG } from "@/lib/owners";
import { overLimit } from "@/lib/rate-limit";
import { normalizeSocial, socialNetworks, type SocialLinks } from "@/lib/socials";
import { updateOwner } from "@/lib/store";
import { addDays, facilityNow, isValidDate } from "@/lib/time";

// Staff-only: starts with requireOwner() and only edits that owner's profile
// and page status.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 3600_000;

/** Address lookups per owner per hour, so the free geocoder isn't hammered. */
const LOOKUPS_PER_HOUR = 20;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

async function lookUp(ownerId: string, address: string): Promise<LatLng | null> {
  if (await overLimit(`geocode:${ownerId}`, LOOKUPS_PER_HOUR, HOUR)) return null;
  const found = await geocode(address);
  return found && { lat: round(found.lat), lng: round(found.lng) };
}

/** "Find on map": where the typed address is, for the pin picker. */
export async function locateAddress(address: string): Promise<{ ok: true; pin: LatLng } | { ok: false; message: string }> {
  const owner = await requireOwner();
  const pin = await lookUp(owner.id, String(address).slice(0, 200));
  return pin ? { ok: true, pin } : { ok: false, message: "Couldn't find that address. Drag the pin to your venue instead." };
}

export async function saveBusiness(form: FormData): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
  const profile: BusinessProfile = {
    name: text("name", 80),
    tagline: text("tagline", 140),
    address: text("address", 200),
    phone: text("phone", 40),
    email: text("email", 120).toLowerCase(),
  };
  if (profile.name.length < 2) return { ok: false, message: "Enter your business name." };
  if (profile.email && !EMAIL.test(profile.email)) return { ok: false, message: "Contact email isn't valid." };
  // Customers' booking pages and emails point them here to change or ask about a booking.
  if (!profile.phone && !profile.email) return { ok: false, message: "Add a phone number or contact email, so customers can reach you." };

  const socials: SocialLinks = {};
  for (const net of socialNetworks) {
    const link = normalizeSocial(net.key, text(`social-${net.key}`, 300));
    if (link === null) return { ok: false, message: `${net.label} link isn't valid. Paste your profile link or type your handle.` };
    if (link) socials[net.key] = link;
  }
  profile.socials = socials;

  // A pin the owner placed wins. Without one, place it from the address, and
  // move an untouched pin when the address changed.
  const lat = parseFloat(text("lat", 20));
  const lng = parseFloat(text("lng", 20));
  const before = owner.profile;
  let pin: LatLng | null = isLatLng(lat, lng) ? { lat: round(lat), lng: round(lng) } : null;
  const untouched = pin?.lat === before.lat && pin?.lng === before.lng;
  if (profile.address && (!pin || (untouched && profile.address !== before.address))) {
    pin = (await lookUp(owner.id, profile.address)) ?? pin;
  }
  if (pin) Object.assign(profile, pin);

  await updateOwner(owner.id, (o) => {
    o.profile = profile;
  });
  updateTag(OWNERS_TAG);
  refresh();
  if (profile.address && !pin) {
    return { ok: true, message: "Saved. We couldn't find your address on the map, so drag the pin to your venue so players nearby can find you." };
  }
  return { ok: true, message: "Saved. Your page is updated." };
}

/** How far ahead a pause may end. Longer breaks can pause with no end date. */
const MAX_PAUSE_DAYS = 365;

/**
 * Pauses the owner's page (or changes the message or reopening date of a
 * pause): it stays online with the message, takes no new requests and leaves
 * the directory. Existing bookings are left as they are.
 */
export async function pausePage(form: FormData): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  const message = String(form.get("message") ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  const until = String(form.get("until") ?? "").trim();
  const today = facilityNow().date;
  if (until && (!isValidDate(until) || until <= today)) return { ok: false, message: "Pick a reopening date after today, or leave it empty." };
  if (until > addDays(today, MAX_PAUSE_DAYS)) return { ok: false, message: "Pick a reopening date within a year, or leave it empty." };

  const at = new Date().toISOString();
  let changed = false;
  await updateOwner(owner.id, (o) => {
    changed = isPaused(o.pause, today);
    o.pause = { at: changed ? o.pause!.at : at, message, ...(until && { until }) };
  });
  updateTag(OWNERS_TAG);
  refresh();
  return { ok: true, message: changed ? "Saved. Your page shows the new details." : "Your page is paused. Customers can't send new requests." };
}

/** Puts the owner's paused page back to taking requests. */
export async function resumePage(): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  await updateOwner(owner.id, (o) => void delete o.pause);
  updateTag(OWNERS_TAG);
  refresh();
  return { ok: true, message: "Your page is taking bookings again." };
}
