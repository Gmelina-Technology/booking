"use server";

import { randomBytes } from "node:crypto";
import { updateTag } from "next/cache";
import { activitiesTag } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { gradients, type Activity } from "@/lib/facility";
import {
  deleteActivity,
  deleteUpload,
  holdsSlot,
  listBookings,
  moveActivity,
  readActivities,
  saveUpload,
  UPLOAD_TYPES,
  upsertActivity,
} from "@/lib/store";
import { facilityNow } from "@/lib/time";

// Every action here is staff-only: each one starts with requireOwner() and is scoped to that owner.

// Photos are resized in the browser first, so they stay well under the 1 MB
// server-action body limit.
const MAX_PHOTO_BYTES = 950 * 1024;

export type ActivityInput = Omit<Activity, "slug" | "background">;
export type SaveResult = { ok: true; slug: string } | { ok: false; error: string };

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function validate(input: ActivityInput): string | null {
  const int = (n: number) => Number.isInteger(n);
  if (input.name.trim().length < 2) return "Name is required.";
  if (!input.emoji.trim()) return "Pick an emoji for the card.";
  if (!gradients.some((g) => g.className === input.gradient)) return "Pick a card colour.";
  if (!(input.pricePerHour >= 0)) return "Price must be 0 or more.";
  if (!int(input.openHour) || !int(input.closeHour) || input.openHour < 0 || input.closeHour > 24)
    return "Opening hours must be whole hours between 0 and 24.";
  if (input.closeHour <= input.openHour) return "Closing time must be after opening time.";
  if (!int(input.maxHoursPerBooking) || input.maxHoursPerBooking < 1) return "Max hours per booking must be at least 1.";
  if (input.maxHoursPerBooking > input.closeHour - input.openHour) return "Max hours per booking is longer than the opening hours.";
  if (input.closedDays && (input.closedDays.length > 6 || input.closedDays.some((d) => !int(d) || d < 0 || d > 6)))
    return "Leave at least one day of the week open.";
  if (input.peak) {
    const { pricePerHour, fromHour, toHour } = input.peak;
    if (!(pricePerHour >= 0)) return "Peak price must be 0 or more.";
    if (!int(fromHour) || !int(toHour) || fromHour < 0 || toHour > 24 || toHour <= fromHour) return "Peak hours must end after they start.";
  }
  if (!int(input.maxPlayers) || input.maxPlayers < 1) return "Max players must be at least 1.";
  if (!input.resourceLabel.trim()) return "Give courts a label, e.g. Court or Table.";
  if (input.resources.length === 0) return "Add at least one court.";
  if (input.resources.some((r) => !r.name.trim())) return "Every court needs a name.";
  const names = input.resources.map((r) => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Court names must be unique.";
  return null;
}

/**
 * Creates an activity (originalSlug null) or updates an existing one. `photo` carries the
 * background: background (File, optional) to replace it, removeBackground ("1") to drop it.
 */
export async function saveActivity(originalSlug: string | null, input: ActivityInput, photo?: FormData): Promise<SaveResult> {
  const owner = await requireOwner();
  const error = validate(input);
  if (error) return { ok: false, error };

  const all = await readActivities(owner.id);
  const existing = originalSlug ? all.find((a) => a.slug === originalSlug) : undefined;
  if (originalSlug && !existing) return { ok: false, error: "That activity no longer exists." };

  // Slugs are permanent once created: bookings and links refer to them.
  let slug = existing?.slug ?? slugify(input.name);
  if (!existing) {
    if (!slug) return { ok: false, error: "Name must contain letters or numbers." };
    const base = slug;
    for (let n = 2; all.some((a) => a.slug === slug); n++) slug = `${base}-${n}`;
  }

  // Don't let staff remove a court that still has upcoming bookings.
  if (existing) {
    const kept = new Set(input.resources.map((r) => r.id));
    const removed = existing.resources.filter((r) => !kept.has(r.id));
    if (removed.length) {
      const today = facilityNow().date;
      const upcoming = (await listBookings({ ownerId: owner.id, activitySlug: slug })).filter(
        (b) => holdsSlot(b) && b.date >= today && removed.some((r) => r.id === b.resourceId),
      );
      if (upcoming.length) {
        const court = removed.find((r) => r.id === upcoming[0].resourceId)!;
        return {
          ok: false,
          error: `${court.name} has ${upcoming.length} upcoming booking${upcoming.length > 1 ? "s" : ""}. Cancel them first, or keep the court.`,
        };
      }
    }
  }

  let background = existing?.background ?? null;
  const file = photo?.get("background");
  if (file instanceof File && file.size > 0) {
    const ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === file.type);
    if (!ext) return { ok: false, error: "Background photos must be JPG, PNG or WebP." };
    if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Try a smaller one." };
    background = await saveUpload(Buffer.from(await file.arrayBuffer()), ext);
  } else if (photo?.get("removeBackground") === "1") {
    background = null;
  }

  const activity: Activity = {
    slug,
    name: input.name.trim(),
    tagline: input.tagline.trim(),
    description: input.description.trim(),
    emoji: input.emoji.trim(),
    gradient: input.gradient,
    background,
    active: input.active,
    pricePerHour: Math.round(input.pricePerHour),
    noDownpayment: !!input.noDownpayment,
    openHour: input.openHour,
    closeHour: input.closeHour,
    closedDays: [...new Set(input.closedDays ?? [])].sort(),
    peak: input.peak
      ? { pricePerHour: Math.round(input.peak.pricePerHour), fromHour: input.peak.fromHour, toHour: input.peak.toHour, weekends: !!input.peak.weekends }
      : null,
    maxHoursPerBooking: input.maxHoursPerBooking,
    maxPlayers: input.maxPlayers,
    resourceLabel: input.resourceLabel.trim(),
    resources: input.resources.map((r) => ({
      id: r.id || `${slug}-${randomBytes(3).toString("hex")}`,
      name: r.name.trim(),
    })),
    includes: input.includes.map((s) => s.trim()).filter(Boolean),
  };
  await upsertActivity(owner.id, activity);
  if (existing?.background && existing.background !== background) await deleteUpload(existing.background);
  updateTag(activitiesTag(owner.id));
  return { ok: true, slug };
}

export async function setActivityActive(slug: string, active: boolean) {
  const owner = await requireOwner();
  const activity = (await readActivities(owner.id)).find((a) => a.slug === slug);
  if (!activity) return;
  await upsertActivity(owner.id, { ...activity, active });
  updateTag(activitiesTag(owner.id));
}

export async function reorderActivity(slug: string, direction: -1 | 1) {
  const owner = await requireOwner();
  await moveActivity(owner.id, slug, direction);
  updateTag(activitiesTag(owner.id));
}

export async function removeActivity(slug: string): Promise<{ ok: boolean; error?: string }> {
  const owner = await requireOwner();
  if ((await listBookings({ ownerId: owner.id, activitySlug: slug })).length > 0)
    return { ok: false, error: "This activity has bookings, so it can't be deleted. Hide it instead." };
  const activity = (await readActivities(owner.id)).find((a) => a.slug === slug);
  await deleteActivity(owner.id, slug);
  if (activity?.background) await deleteUpload(activity.background);
  updateTag(activitiesTag(owner.id));
  return { ok: true };
}
