import { cacheLife, cacheTag } from "next/cache";
import type { HostedEvent } from "./facility";
import { readHostedEvents } from "./store";

/** Cache tag for one owner's hosted events. */
export const hostedEventsTag = (ownerId: string) => `hosted-events:${ownerId}`;

/** Every hosted event of an owner, soonest first. Cached until they change one. */
export async function getHostedEvents(ownerId: string): Promise<HostedEvent[]> {
  "use cache";
  cacheLife("max");
  cacheTag(hostedEventsTag(ownerId));
  return (await readHostedEvents(ownerId)).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
}

export async function getHostedEvent(ownerId: string, id: string): Promise<HostedEvent | undefined> {
  return (await getHostedEvents(ownerId)).find((e) => e.id === id);
}
