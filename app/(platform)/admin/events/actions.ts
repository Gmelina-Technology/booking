"use server";

import { randomBytes } from "node:crypto";
import { updateTag } from "next/cache";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { eventsTag } from "@/lib/events";
import type { PastEvent } from "@/lib/facility";
import { deleteEvent, deleteUpload, readEvents, saveUpload, UPLOAD_TYPES, upsertEvent } from "@/lib/store";
import { facilityNow, isValidDate } from "@/lib/time";

// Every action here is staff-only: each one starts with requireOwner() and is scoped to that owner.

// Photos are resized in the browser first, so they stay well under the 1 MB
// server-action body limit.
const MAX_PHOTO_BYTES = 950 * 1024;

export type SaveEventResult = { ok: true } | { ok: false; error: string };

/**
 * Creates (id null) or updates an event. Form fields: title, date, activitySlug,
 * summary, participants, published ("on"), photo (File, optional), removePhoto ("1").
 */
export async function saveEvent(id: string | null, form: FormData): Promise<SaveEventResult> {
  const owner = await requireOwner();
  const title = String(form.get("title") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const activitySlug = String(form.get("activitySlug") ?? "");
  const summary = String(form.get("summary") ?? "").trim().slice(0, 300);
  const participants = Number(form.get("participants") || 0);
  const published = form.get("published") === "on";

  if (title.length < 3) return { ok: false, error: "Give the event a title." };
  if (!isValidDate(date)) return { ok: false, error: "Pick the date the event happened." };
  if (date > facilityNow().date) return { ok: false, error: "This section is for past events, so the date can't be in the future." };
  if (!(await getAllActivities(owner.id)).some((a) => a.slug === activitySlug)) return { ok: false, error: "Pick which activity it featured." };
  if (!Number.isInteger(participants) || participants < 0) return { ok: false, error: "Participants must be a whole number (0 to hide)." };

  const existing = id ? (await readEvents(owner.id)).find((e) => e.id === id) : undefined;
  if (id && !existing) return { ok: false, error: "That event no longer exists." };

  let photo = existing?.photo ?? null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === file.type);
    if (!ext) return { ok: false, error: "Photos must be JPG, PNG or WebP." };
    if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Try a smaller one." };
    photo = await saveUpload(Buffer.from(await file.arrayBuffer()), ext);
  } else if (form.get("removePhoto") === "1") {
    photo = null;
  }

  const event: PastEvent = {
    id: existing?.id ?? randomBytes(6).toString("hex"),
    title,
    date,
    activitySlug,
    summary,
    participants,
    photo,
    published,
  };
  const previous = await upsertEvent(owner.id, event);
  if (previous?.photo && previous.photo !== photo) await deleteUpload(previous.photo);
  updateTag(eventsTag(owner.id));
  return { ok: true };
}

export async function setEventPublished(id: string, published: boolean) {
  const owner = await requireOwner();
  const event = (await readEvents(owner.id)).find((e) => e.id === id);
  if (!event) return;
  await upsertEvent(owner.id, { ...event, published });
  updateTag(eventsTag(owner.id));
}

export async function removeEvent(id: string) {
  const owner = await requireOwner();
  const event = await deleteEvent(owner.id, id);
  if (event?.photo) await deleteUpload(event.photo);
  updateTag(eventsTag(owner.id));
}
