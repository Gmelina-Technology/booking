import { timingSafeEqual } from "node:crypto";
import { releaseOverdueHolds } from "@/lib/holds";
import { listOwners } from "@/lib/store";

// Daily sweep (see "crons" in vercel.json) that releases unpaid holds past
// their payment window for every business, including ones nobody has looked
// at since. Holds are also released as soon as customers or staff view the
// day (lib/holds.ts), so this is the safety net, not the main path.
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

  let released = 0;
  let failed = 0;
  for (const owner of await listOwners()) {
    try {
      released += (await releaseOverdueHolds(owner.id)).size;
    } catch (err) {
      // One business's bad data shouldn't stop the sweep for everyone else.
      failed++;
      console.error(`Releasing holds for owner ${owner.id} failed:`, err);
    }
  }
  return Response.json({ released, failed });
}
