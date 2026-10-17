import { cacheLife, cacheTag } from "next/cache";
import type { PastEvent } from "./facility";
import { readEvents } from "./store";

export const EVENTS_TAG = "events";

/** Every past event, newest first. Cached until staff edit one. */
export async function getAllEvents(): Promise<PastEvent[]> {
  "use cache";
  cacheLife("max");
  cacheTag(EVENTS_TAG);
  return (await readEvents()).sort((a, b) => b.date.localeCompare(a.date));
}

/** Events shown on the home page. */
export async function getPublishedEvents(): Promise<PastEvent[]> {
  return (await getAllEvents()).filter((e) => e.published);
}

export async function getEvent(id: string): Promise<PastEvent | undefined> {
  return (await getAllEvents()).find((e) => e.id === id);
}

export function photoUrl(photo: string) {
  return `/uploads/${photo}`;
}
