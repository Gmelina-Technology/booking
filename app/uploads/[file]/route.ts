import { readUpload, UPLOAD_TYPES } from "@/lib/store";

// Serves photos uploaded by staff. Files get a random name on upload and are
// never overwritten, so they can be cached forever.
export async function GET(_req: Request, { params }: RouteContext<"/uploads/[file]">) {
  const { file } = await params;
  const data = await readUpload(file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": UPLOAD_TYPES[file.split(".").pop()!],
      // s-maxage lets Vercel's CDN cache it too, so repeat views skip the function.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
