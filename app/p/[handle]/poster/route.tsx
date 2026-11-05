import { ImageResponse } from "next/og";
import { getHeroSettings } from "@/lib/banner";
import { platform } from "@/lib/facility";
import { isLight, withAlpha } from "@/lib/hero";
import { getPublicOwner } from "@/lib/owners";
import { qrPath, qrPng } from "@/lib/qr";
import { siteUrl } from "@/lib/site-url";

// A printable "Scan to book" poster for the front desk or the court fence:
// the business's QR code (lib/qr.ts) in its banner colours. A4 portrait at
// 150 dpi, so it prints edge to edge on the paper most partners have.

const size = { width: 1240, height: 1754 };

export async function GET(request: Request, { params }: RouteContext<"/p/[handle]/poster">) {
  const owner = await getPublicOwner((await params).handle);
  if (!owner) return new Response("Not found", { status: 404 });
  const settings = await getHeroSettings(owner.id);
  const { name, tagline } = owner.profile;

  const base = await siteUrl();
  const qr = `data:image/png;base64,${(await qrPng(`${base}${qrPath(owner.handle)}`, 880)).toString("base64")}`;
  const fg = isLight(settings.background) ? "#1c1917" : "#ffffff";
  const muted = withAlpha(fg, 0.75);
  const onAccent = isLight(settings.accent) ? "#1c1917" : "#ffffff";

  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "110px 100px 90px",
          background: settings.background,
          color: fg,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", fontSize: name.length > 24 ? 84 : 104, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>{name}</div>
          {tagline && <div style={{ display: "flex", fontSize: 40, color: muted, lineHeight: 1.3, maxWidth: 1000 }}>{tagline}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
          <div
            style={{ display: "flex", padding: "18px 48px", borderRadius: 20, background: settings.accent, color: onAccent, fontSize: 56, fontWeight: 700 }}
          >
            Scan to book a court
          </div>
          <div style={{ display: "flex", padding: 28, borderRadius: 40, background: "#ffffff" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not a page */}
            <img src={qr} alt="" width={760} height={760} />
          </div>
          <div style={{ display: "flex", fontSize: 36, color: muted }}>or visit {`${base.replace(/^https?:\/\//, "")}${qrPath(owner.handle)}`}</div>
        </div>

        <div style={{ display: "flex", fontSize: 28, color: muted }}>Online booking by {platform.name}</div>
      </div>
    ),
    size,
  );

  if (new URL(request.url).searchParams.has("download")) {
    image.headers.set("Content-Disposition", `attachment; filename="${owner.handle}-poster.png"`);
  }
  return image;
}
