import { cacheLife, cacheTag } from "next/cache";
import type { PastEvent } from "./facility";
import { readEvents } from "./store";

/** Cache tag for one owner's events. */
export const eventsTag = (ownerId: string) => `events:${ownerId}`;

/** Every past event of an owner, newest first. Cached until they edit one. */
export async function getAllEvents(ownerId: string): Promise<PastEvent[]> {
  "use cache";
  cacheLife("max");
  cacheTag(eventsTag(ownerId));
  return (await readEvents(ownerId)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Events shown on the owner's page. */
export async function getPublishedEvents(ownerId: string): Promise<PastEvent[]> {
  return (await getAllEvents(ownerId)).filter((e) => e.published);
}

export async function getEvent(ownerId: string, id: string): Promise<PastEvent | undefined> {
  return (await getAllEvents(ownerId)).find((e) => e.id === id);
}

export function photoUrl(photo: string) {
  return `/uploads/${photo}`;
}
