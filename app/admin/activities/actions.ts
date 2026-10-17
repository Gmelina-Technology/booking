"use server";

import { randomBytes } from "node:crypto";
import { updateTag } from "next/cache";
import { ACTIVITIES_TAG } from "@/lib/activities";
import { requireStaff } from "@/lib/auth";
import { gradients, type Activity } from "@/lib/facility";
import { deleteActivity, listBookings, moveActivity, readActivities, upsertActivity } from "@/lib/store";
import { facilityNow } from "@/lib/time";

// Every action here is staff-only: each one starts with requireStaff().

export type ActivityInput = Omit<Activity, "slug">;
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
  if (!int(input.maxPlayers) || input.maxPlayers < 1) return "Max players must be at least 1.";
  if (!input.resourceLabel.trim()) return "Give courts a label, e.g. Court or Table.";
  if (input.resources.length === 0) return "Add at least one court.";
  if (input.resources.some((r) => !r.name.trim())) return "Every court needs a name.";
  const names = input.resources.map((r) => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Court names must be unique.";
  return null;
}

/** Creates an activity (originalSlug null) or updates an existing one. */
export async function saveActivity(originalSlug: string | null, input: ActivityInput): Promise<SaveResult> {
  await requireStaff();
  const error = validate(input);
  if (error) return { ok: false, error };

  const all = await readActivities();
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
      const upcoming = (await listBookings({ activitySlug: slug })).filter(
        (b) => b.status === "confirmed" && b.date >= today && removed.some((r) => r.id === b.resourceId),
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

  const activity: Activity = {
    slug,
    name: input.name.trim(),
    tagline: input.tagline.trim(),
    description: input.description.trim(),
    emoji: input.emoji.trim(),
    gradient: input.gradient,
    active: input.active,
    pricePerHour: Math.round(input.pricePerHour),
    openHour: input.openHour,
    closeHour: input.closeHour,
    maxHoursPerBooking: input.maxHoursPerBooking,
    maxPlayers: input.maxPlayers,
    resourceLabel: input.resourceLabel.trim(),
    resources: input.resources.map((r) => ({
      id: r.id || `${slug}-${randomBytes(3).toString("hex")}`,
      name: r.name.trim(),
    })),
    includes: input.includes.map((s) => s.trim()).filter(Boolean),
  };
  await upsertActivity(activity);
  updateTag(ACTIVITIES_TAG);
  return { ok: true, slug };
}

export async function setActivityActive(slug: string, active: boolean) {
  await requireStaff();
  const activity = (await readActivities()).find((a) => a.slug === slug);
  if (!activity) return;
  await upsertActivity({ ...activity, active });
  updateTag(ACTIVITIES_TAG);
}

export async function reorderActivity(slug: string, direction: -1 | 1) {
  await requireStaff();
  await moveActivity(slug, direction);
  updateTag(ACTIVITIES_TAG);
}

export async function removeActivity(slug: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  if ((await listBookings({ activitySlug: slug })).length > 0)
    return { ok: false, error: "This activity has bookings, so it can't be deleted. Hide it instead." };
  await deleteActivity(slug);
  updateTag(ACTIVITIES_TAG);
  return { ok: true };
}
