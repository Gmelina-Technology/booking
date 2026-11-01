"use server";

import { updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { heroTag } from "@/lib/banner";
import { MAX_LIBRARY_IMAGES, normalizeHeroSettings, type HeroSettings } from "@/lib/hero";
import { deleteUpload, readHero, saveUpload, UPLOAD_TYPES, updateHero } from "@/lib/store";

// Every action here is staff-only: each one starts with requireOwner() and is scoped to that owner.
// Photos are uploaded one per call (each under the 1 MB server-action body limit)
// into the owner's banner library; the settings can only reference library photos.

const MAX_PHOTO_BYTES = 950 * 1024;

export type UploadResult = { ok: true; name: string } | { ok: false; error: string };

export async function uploadBannerPhoto(form: FormData): Promise<UploadResult> {
  const owner = await requireOwner();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a photo to upload." };
  const ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === file.type);
  if (!ext) return { ok: false, error: "Photos must be JPG, PNG or WebP." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Try a smaller one." };
  if ((await readHero(owner.id)).library.length >= MAX_LIBRARY_IMAGES)
    return { ok: false, error: `You can keep up to ${MAX_LIBRARY_IMAGES} banner photos. Delete one first.` };

  const name = await saveUpload(Buffer.from(await file.arrayBuffer()), ext);
  const added = await updateHero(owner.id, (doc) => {
    if (doc.library.length >= MAX_LIBRARY_IMAGES) return false;
    doc.library.push(name);
    return true;
  });
  if (!added) {
    await deleteUpload(name);
    return { ok: false, error: `You can keep up to ${MAX_LIBRARY_IMAGES} banner photos. Delete one first.` };
  }
  return { ok: true, name };
}

/** Removes a photo from the library (and the banner, if it's in use) and deletes the file. */
export async function deleteBannerPhoto(name: string): Promise<void> {
  const owner = await requireOwner();
  const removed = await updateHero(owner.id, (doc) => {
    if (!doc.library.includes(name)) return false;
    doc.library = doc.library.filter((n) => n !== name);
    doc.settings = { ...doc.settings, images: (doc.settings.images ?? []).filter((n) => n !== name) };
    return true;
  });
  if (!removed) return;
  await deleteUpload(name);
  updateTag(heroTag(owner.id));
}

export async function saveBanner(input: HeroSettings): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  await updateHero(owner.id, (doc) => {
    doc.settings = normalizeHeroSettings(input, doc.library);
  });
  updateTag(heroTag(owner.id));
  return { ok: true, message: "Saved. Your page is updated." };
}
