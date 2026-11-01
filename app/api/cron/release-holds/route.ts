import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { releaseOverdueHolds } from "@/lib/holds";
import { isPaused, OWNERS_TAG } from "@/lib/owners";
import { listOwners, updateOwner } from "@/lib/store";
import { facilityNow } from "@/lib/time";

// Daily sweep (see "crons" in vercel.json) that releases unpaid holds past
// their payment window for every business, including ones nobody has looked
// at since. Holds are also released as soon as customers or staff view the
// day (lib/holds.ts), so this is the safety net, not the main path.
//
// It also reopens pages whose partner paused them until today. It runs at
// midnight facility time, so they're back in the directory that morning.
//
// Vercel sends CRON_SECRET as a bearer token. Without it set, the route refuses
// every request, so nobody else can trigger it.

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });

  const today = facilityNow().date;
  let released = 0;
  let reopened = 0;
  let failed = 0;
  for (const owner of await listOwners()) {
    try {
      released += (await releaseOverdueHolds(owner.id)).size;
      if (owner.pause && !isPaused(owner.pause, today)) {
        await updateOwner(owner.id, (o) => {
          // The partner may have paused again since the list was read.
          if (o.pause && !isPaused(o.pause, today)) delete o.pause;
        });
        reopened++;
      }
    } catch (err) {
      // One business's bad data shouldn't stop the sweep for everyone else.
      failed++;
      console.error(`Daily sweep for owner ${owner.id} failed:`, err);
    }
  }
  if (reopened) revalidateTag(OWNERS_TAG, { expire: 0 });
  return Response.json({ released, reopened, failed });
}
