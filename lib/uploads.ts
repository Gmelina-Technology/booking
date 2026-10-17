import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

// Staff-uploaded images (event photos, payment QR). Stored in Vercel Blob when
// BLOB_READ_WRITE_TOKEN is set (production on Vercel), otherwise in
// ./data/uploads for local development. Always served via /uploads/<name>.

export const UPLOAD_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function blobEnabled() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  if (process.env.VERCEL) throw new Error("Uploads need Vercel Blob on Vercel: connect a Blob store so BLOB_READ_WRITE_TOKEN is set.");
  return false;
}

/** "public" or "private": must match how the Blob store was created. */
const blobAccess = () => (process.env.BLOB_ACCESS === "private" ? "private" : "public");
const blobPath = (name: string) => `uploads/${name}`;

/** Only names we generated ourselves are valid, so paths can't escape the folder. */
export function isUploadName(name: string) {
  return /^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name);
}

export async function saveUpload(data: Buffer, ext: string): Promise<string> {
  const name = `${randomBytes(8).toString("hex")}.${ext}`;
  if (blobEnabled()) {
    await put(blobPath(name), data, { access: blobAccess(), contentType: UPLOAD_TYPES[ext], addRandomSuffix: false });
  } else {
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path.join(UPLOADS_DIR, name), data);
  }
  return name;
}

export async function readUpload(name: string): Promise<Buffer | null> {
  if (!isUploadName(name)) return null;
  try {
    if (blobEnabled()) {
      const result = await get(blobPath(name), { access: blobAccess() });
      if (!result || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    }
    return await readFile(path.join(UPLOADS_DIR, name));
  } catch {
    return null;
  }
}

export async function deleteUpload(name: string): Promise<void> {
  if (!isUploadName(name)) return;
  if (blobEnabled()) await del(blobPath(name)).catch(() => {});
  else await unlink(path.join(UPLOADS_DIR, name)).catch(() => {});
}
