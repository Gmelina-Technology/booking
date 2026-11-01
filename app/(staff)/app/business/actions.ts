"use server";

import { refresh, updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth";
import type { BusinessProfile } from "@/lib/facility";
import { OWNERS_TAG } from "@/lib/owners";
import { updateOwner } from "@/lib/store";

// Staff-only: starts with requireOwner() and only edits that owner's profile.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveBusiness(form: FormData): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
  const profile: BusinessProfile = {
    name: text("name", 80),
    tagline: text("tagline", 140),
    address: text("address", 200),
    phone: text("phone", 40),
    email: text("email", 120).toLowerCase(),
  };
  if (profile.name.length < 2) return { ok: false, message: "Enter your business name." };
  if (profile.email && !EMAIL.test(profile.email)) return { ok: false, message: "Contact email isn't valid." };

  await updateOwner(owner.id, (o) => {
    o.profile = profile;
  });
  updateTag(OWNERS_TAG);
  refresh();
  return { ok: true, message: "Saved. Your page is updated." };
}
