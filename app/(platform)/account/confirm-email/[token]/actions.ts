"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { emailChangeMatches, readEmailChangeToken } from "@/lib/email-change";
import { accountNoticeEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";
import { maskEmail } from "@/lib/signup-verification";
import { getOwnerByEmail, getOwnerById, updateOwner } from "@/lib/store";

class LinkUsed extends Error {}

/** Applies a sign-in email change from the link sent to the new address (lib/email-change.ts). */
export async function confirmEmailChange(token: string): Promise<void> {
  const request = readEmailChangeToken(token);
  const owner = request && (await getOwnerById(request.ownerId));
  if (!request || !owner || !emailChangeMatches(owner, token)) redirect(`/account/confirm-email/${encodeURIComponent(token)}`);
  const oldEmail = owner.email;

  const taken = await getOwnerByEmail(request.newEmail);
  if (taken && taken.id !== owner.id) redirect("/app/account?emailTaken=1");
  try {
    await updateOwner(owner.id, (o) => {
      // Re-checked under the lock, so the link can't be used twice at once.
      if (!emailChangeMatches(o, token)) throw new LinkUsed();
      o.email = request.newEmail;
    });
  } catch (err) {
    if (err instanceof LinkUsed) redirect(`/account/confirm-email/${encodeURIComponent(token)}`);
    // Another account took the address between the check and the update (Postgres unique email).
    if ((err as { code?: string }).code === "23505") redirect("/app/account?emailTaken=1");
    throw err;
  }

  // Tell the old address, in case this wasn't the owner.
  after(async () => {
    const result = await sendMail(
      accountNoticeEmail(oldEmail, "Your sign-in email was changed", `Your account now signs in with ${maskEmail(request.newEmail)} instead of this address.`),
    );
    if (!result.ok) console.error("Email change notice failed:", result.detail);
  });
  redirect("/app/account?emailChanged=1");
}
