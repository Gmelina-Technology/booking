import { ImageResponse } from "next/og";
import { getActiveActivities } from "@/lib/activities";
import { getHeroSettings } from "@/lib/banner";
import { platform } from "@/lib/facility";
import { isLight, withAlpha } from "@/lib/hero";
import { getPublicOwner } from "@/lib/owners";
import { readUpload, UPLOAD_TYPES } from "@/lib/store";

// The picture shown when a business page is shared on Facebook, Messenger, X,
// etc. Uses the owner's banner colours and first banner photo (/app/banner),
// so it matches the page. Also applies to the activity pages below it.

export const alt = "Book a court online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const owner = await getPublicOwner((await params).handle);
  if (!owner) return new Response("Not found", { status: 404 });
  const [settings, activities] = await Promise.all([getHeroSettings(owner.id), getActiveActivities(owner.id)]);
  const { name, tagline, address } = owner.profile;

  const fg = isLight(settings.background) ? "#1c1917" : "#ffffff";
  const muted = withAlpha(fg, 0.75);
  const onAccent = isLight(settings.accent) ? "#1c1917" : "#ffffff";
  const photo = await photoDataUrl(settings.images[0]);
  // Fewer chips beside a photo, so they stay on one line.
  const sports = activities.slice(0, photo ? 3 : 4).map((a) => a.name);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: settings.background, color: fg }}>
        {photo && (
          <div style={{ display: "flex", position: "absolute", right: 0, top: 0, width: 520, height: 630 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not a page */}
            <img src={photo} alt="" width={520} height={630} style={{ objectFit: "cover", width: 520, height: 630 }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 520,
                height: 630,
                display: "flex",
                backgroundImage: `linear-gradient(to right, ${settings.background}, ${withAlpha(settings.background, 0)} 60%)`,
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: photo ? 760 : 1200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 72,
                height: 72,
                borderRadius: 18,
                background: settings.accent,
                color: onAccent,
                fontSize: 40,
                fontWeight: 700,
              }}
            >
              {name.trim()[0]?.toUpperCase()}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: muted }}>{address || `@${owner.handle}`}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", fontSize: name.length > 28 ? 64 : 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{name}</div>
            {tagline && <div style={{ display: "flex", fontSize: photo ? 30 : 34, color: muted, lineHeight: 1.3 }}>{tagline}</div>}
            {sports.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                {sports.map((s) => (
                  <div
                    key={s}
                    style={{ display: "flex", padding: "8px 20px", borderRadius: 999, border: `2px solid ${withAlpha(fg, 0.25)}`, fontSize: 26 }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{ display: "flex", padding: "14px 32px", borderRadius: 14, background: settings.accent, color: onAccent, fontSize: 30, fontWeight: 700 }}
            >
              Book a court online
            </div>
            <div style={{ display: "flex", fontSize: 24, color: muted }}>on {platform.name}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

/** The owner's banner photo as a data URL, or null (no photo, or a format the renderer can't read). */
async function photoDataUrl(name: string | undefined): Promise<string | null> {
  const type = name && UPLOAD_TYPES[name.split(".").pop()!];
  if (!name || (type !== "image/jpeg" && type !== "image/png")) return null;
  const data = await readUpload(name).catch(() => null);
  return data && `data:${type};base64,${data.toString("base64")}`;
}
