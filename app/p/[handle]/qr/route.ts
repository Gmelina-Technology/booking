import { getPublicOwner } from "@/lib/owners";
import { qrPath, qrPng, qrSvg } from "@/lib/qr";
import { siteUrl } from "@/lib/site-url";

// A business's QR code, which opens its booking page when scanned. SVG by
// default (sharp at any print size); ?format=png for apps that want a picture.
// ?download saves it as a file instead of showing it.
export async function GET(request: Request, { params }: RouteContext<"/p/[handle]/qr">) {
  const owner = await getPublicOwner((await params).handle);
  if (!owner) return new Response("Not found", { status: 404 });

  const query = new URL(request.url).searchParams;
  const png = query.get("format") === "png";
  const url = `${await siteUrl()}${qrPath(owner.handle)}`;
  const body = png ? new Uint8Array(await qrPng(url)) : await qrSvg(url);

  return new Response(body, {
    headers: {
      "Content-Type": png ? "image/png" : "image/svg+xml",
      ...(query.has("download") && { "Content-Disposition": `attachment; filename="${owner.handle}-qr.${png ? "png" : "svg"}"` }),
      // The code only changes if the site's address does.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
