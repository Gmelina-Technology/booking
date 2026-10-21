import { cacheLife, cacheTag } from "next/cache";
import type { Activity } from "./facility";
import { readActivities } from "./store";

/** Cache tag for one owner's activities. */
export const activitiesTag = (ownerId: string) => `activities:${ownerId}`;

/** Every activity of an owner, including hidden ones, in display order. Cached until they edit one. */
export async function getAllActivities(ownerId: string): Promise<Activity[]> {
  "use cache";
  cacheLife("max");
  cacheTag(activitiesTag(ownerId));
  return readActivities(ownerId);
}

/** Activities customers can see and book. */
export async function getActiveActivities(ownerId: string): Promise<Activity[]> {
  return (await getAllActivities(ownerId)).filter((a) => a.active);
}

export async function getActivity(ownerId: string, slug: string): Promise<Activity | undefined> {
  return (await getAllActivities(ownerId)).find((a) => a.slug === slug);
}
