"use server";

import { refresh } from "next/cache";
import { requireAccountHolder } from "@/lib/auth";
import { updateOwner } from "@/lib/store";

/** Records that the signed-in partner agreed to per-booking fees. */
export async function acceptFeeTerms(): Promise<void> {
  const owner = await requireAccountHolder();
  await updateOwner(owner.id, (o) => {
    o.feeTermsAcceptedAt ??= new Date().toISOString();
  });
  refresh();
}
