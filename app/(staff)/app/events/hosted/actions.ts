"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { getActivity } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { bookingEmailContext, logBookingEmail } from "@/lib/booking-mail";
import { eventCancelledEmail } from "@/lib/emails";
import type { HostedEventKind } from "@/lib/facility";
import { cancelEvent, createEvent, deleteDraft, publishEvent, updateEvent, type EventInput } from "@/lib/hosted-event-ops";
import { hostedEventsTag } from "@/lib/hosted-events";
import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { deleteUpload, readHostedEvents, readSettings, saveUpload, UPLOAD_TYPES } from "@/lib/store";
import { facilityNow } from "@/lib/time";

// Staff-only: each action starts with requireOwner() and is scoped to that owner.
// The rules live in lib/hosted-event-ops.ts; these add auth, photos, caching and email.

const MAX_PHOTO_BYTES = 950 * 1024;

export type HostedResult = { ok: true; id: string; message?: string } | { ok: false; error: string };

const int = (v: FormDataEntryValue | null) => (v === null || v === "" ? NaN : Number(v));

/** Reads the event form. Times come as minutes after midnight. */
function readInput(form: FormData): EventInput {
  const kind = String(form.get("kind") ?? "") as HostedEventKind;
  const tournament = kind === "tournament";
  return {
    kind,
    title: String(form.get("title") ?? ""),
    activitySlug: String(form.get("activitySlug") ?? ""),
    description: String(form.get("description") ?? ""),
    date: String(form.get("date") ?? ""),
    startMinute: int(form.get("startMinute")),
    endMinute: int(form.get("endMinute")),
    resourceIds: form.getAll("resourceIds").map(String),
    capacity: int(form.get("capacity")),
    maxSpotsPerRegistration: tournament ? 1 : int(form.get("maxSpotsPerRegistration")),
    teamSize: tournament ? int(form.get("teamSize")) : undefined,
    price: int(form.get("price") || "0"),
    payment: form.get("payment") === "venue" ? "venue" : "online",
    closeHoursBefore: int(form.get("closeHoursBefore") || "0"),
  };
}

async function context(ownerId: string, activitySlug: string) {
  const [activity, settings] = await Promise.all([getActivity(ownerId, activitySlug), readSettings(ownerId)]);
  return { activity, settings, today: facilityNow().date };
}

/** The photo from the form: a new upload, removed, or unchanged. */
async function readPhoto(form: FormData, current: string | null): Promise<{ photo: string | null } | { error: string }> {
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === file.type);
    if (!ext) return { error: "Photos must be JPG, PNG or WebP." };
    if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is too large. Try a smaller one." };
    return { photo: await saveUpload(Buffer.from(await file.arrayBuffer()), ext) };
  }
  return { photo: form.get("removePhoto") === "1" ? null : current };
}

/**
 * Creates (id null) or updates an event from the form, then publishes it when
 * `publish` and it's still a draft. A new event that fails to publish is kept as a draft.
 */
export async function saveHostedEvent(id: string | null, form: FormData, publish: boolean): Promise<HostedResult> {
  const owner = await requireOwner();
  const input = readInput(form);
  const ctx = await context(owner.id, input.activitySlug);
  const existing = id ? (await readHostedEvents(owner.id)).find((e) => e.id === id) : undefined;
  if (id && !existing) return { ok: false, error: "That event no longer exists." };

  const picked = await readPhoto(form, existing?.photo ?? null);
  if ("error" in picked) return { ok: false, error: picked.error };
  const result = existing ? await updateEvent(owner.id, existing.id, input, picked.photo, ctx) : await createEvent(owner.id, input, picked.photo, ctx);
  if (!result.ok) {
    if (picked.photo && picked.photo !== existing?.photo) await deleteUpload(picked.photo);
    return result;
  }
  if (existing?.photo && existing.photo !== picked.photo) await deleteUpload(existing.photo);
  updateTag(hostedEventsTag(owner.id));

  const event = result.value;
  if (publish && event.status === "draft") {
    const published = await publishEvent(owner.id, event.id, ctx);
    if (!published.ok) return { ok: false, error: `Saved as a draft, but it couldn't be published: ${published.error}` };
    refresh();
    return { ok: true, id: event.id, message: "Published. Players can register now." };
  }
  refresh();
  return { ok: true, id: event.id, message: existing ? "Saved." : "Saved as a draft." };
}

export async function publishHostedEvent(id: string): Promise<HostedResult> {
  const owner = await requireOwner();
  const event = (await readHostedEvents(owner.id)).find((e) => e.id === id);
  if (!event) return { ok: false, error: "That event no longer exists." };
  const result = await publishEvent(owner.id, id, await context(owner.id, event.activitySlug));
  if (!result.ok) return result;
  updateTag(hostedEventsTag(owner.id));
  refresh();
  return { ok: true, id, message: "Published. Players can register now." };
}

/** Cancels the event: every registrant is emailed, and the courts are freed. */
export async function cancelHostedEvent(id: string, reason: string): Promise<HostedResult> {
  const owner = await requireOwner();
  const result = await cancelEvent(owner.id, id, reason);
  if (!result.ok) return result;
  const cancelled = result.value;
  const base = await siteUrl();
  after(async () => {
    for (const b of cancelled) {
      if (!b.email) continue;
      const mail = await sendMail(eventCancelledEmail(await bookingEmailContext(owner.id, owner.profile, b, base)));
      await logBookingEmail(owner.id, b.id, "event_cancelled", mail);
      if (!mail.ok) console.error(`Event cancel email for ${b.id} failed:`, mail.detail);
    }
  });
  updateTag(hostedEventsTag(owner.id));
  refresh();
  const told = cancelled.filter((b) => b.email).length;
  return { ok: true, id, message: cancelled.length ? `Cancelled. Emailing ${told} registrant${told === 1 ? "" : "s"}.` : "Cancelled." };
}

/** Starts a new draft with the same details (on today or later). */
export async function duplicateHostedEvent(id: string): Promise<HostedResult> {
  const owner = await requireOwner();
  const event = (await readHostedEvents(owner.id)).find((e) => e.id === id);
  if (!event) return { ok: false, error: "That event no longer exists." };
  const ctx = await context(owner.id, event.activitySlug);
  const copy = await createEvent(owner.id, { ...event, date: event.date < ctx.today ? ctx.today : event.date }, null, ctx);
  if (!copy.ok) return copy;
  updateTag(hostedEventsTag(owner.id));
  return { ok: true, id: copy.value.id, message: "Copied as a new draft. Set the date and publish it." };
}

export async function deleteHostedEvent(id: string): Promise<HostedResult> {
  const owner = await requireOwner();
  const result = await deleteDraft(owner.id, id);
  if (!result.ok) return result;
  if (result.value.photo) await deleteUpload(result.value.photo);
  updateTag(hostedEventsTag(owner.id));
  return { ok: true, id, message: "Deleted." };
}
