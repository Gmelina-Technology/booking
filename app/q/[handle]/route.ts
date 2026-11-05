import { NextResponse } from "next/server";
import { getPublicOwner, ownerPath } from "@/lib/owners";

// Where a business's QR code lands (lib/qr.ts): sends the scanner on to the
// booking page. Temporary redirects, so phones don't remember the target and
// printed codes follow the page if it ever moves. A business that's gone or
// suspended sends people to the directory instead of a dead end.
export async function GET(request: Request, { params }: RouteContext<"/q/[handle]">) {
  const owner = await getPublicOwner((await params).handle);
  const target = owner ? ownerPath(owner.handle) : "/venues";
  return NextResponse.redirect(new URL(target, request.url), 307);
}
