import { cacheLife, cacheTag } from "next/cache";
import type { Activity } from "./facility";
import { readActivities } from "./store";

export const ACTIVITIES_TAG = "activities";

/** Every activity, including hidden ones, in display order. Cached until staff edit one. */
export async function getAllActivities(): Promise<Activity[]> {
  "use cache";
  cacheLife("max");
  cacheTag(ACTIVITIES_TAG);
  return readActivities();
}

/** Activities customers can see and book. */
export async function getActiveActivities(): Promise<Activity[]> {
  return (await getAllActivities()).filter((a) => a.active);
}

export async function getActivity(slug: string): Promise<Activity | undefined> {
  return (await getAllActivities()).find((a) => a.slug === slug);
}
