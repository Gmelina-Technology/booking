"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { activitiesTag } from "@/lib/activities";
import { requireAccountHolder, sessionVersion, startSession } from "@/lib/auth";
import { heroTag } from "@/lib/banner";
import { createEmailChangeToken, EMAIL_CHANGE_MINUTES } from "@/lib/email-change";
import { accountNoticeEmail, emailChangeEmail } from "@/lib/emails";
import { eventsTag } from "@/lib/events";
import { platform } from "@/lib/facility";
import { sendMail, type Mail } from "@/lib/mailer";
import { OWNERS_TAG } from "@/lib/owners";
import { hashPassword, verifyPassword } from "@/lib/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { overLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/session";
import { maskEmail } from "@/lib/signup-verification";
import { siteUrl } from "@/lib/site-url";
import {
  deleteOwner,
  deleteUpload,
  holdsSlot,
  listBookings,
  readEvents,
  readHero,
  readSettings,
  updateOwner,
  type Owner,
} from "@/lib/store";
import { facilityNow } from "@/lib/time";

// The signed-in owner's own account: sign-in email, password, and deleting it.
// Every action starts with requireAccountHolder() and asks for the current password,
// so a session left open on a shared computer can't take over the account.

export type AccountState = { ok: boolean; message: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_TRIES = 5;
const PASSWORD_TRIES_WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAIL_CHANGES_PER_HOUR = 3;

/** An error message if the current password is wrong (or tried too often), else null. */
async function checkPassword(owner: Owner, password: string): Promise<string | null> {
  if (await overLimit(`account-password:${owner.id}`, MAX_PASSWORD_TRIES, PASSWORD_TRIES_WINDOW_MS))
    return "Too many tries. Wait 15 minutes and try again.";
  return (await verifyPassword(password, owner.passwordHash)) ? null : "Your current password isn't right.";
}

/** Sends a security notice after the response, without failing the action if email is down. */
function notify(mail: Mail) {
  after(async () => {
    const result = await sendMail(mail);
    if (!result.ok) console.error("Account notice email failed:", result.detail);
  });
}

export async function changePassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  const owner = await requireAccountHolder();
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `Use a new password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (password.length > 200) return { ok: false, message: "That password is too long." };
  if (password !== String(form.get("confirm") ?? "")) return { ok: false, message: "The two new passwords don't match." };
  const wrong = await checkPassword(owner, String(form.get("current") ?? ""));
  if (wrong) return { ok: false, message: wrong };

  const passwordHash = await hashPassword(password);
  const updated = await updateOwner(owner.id, (o) => {
    o.passwordHash = passwordHash;
    // Sign out every other device; this one gets a fresh session below.
    o.sessionVersion = sessionVersion(o) + 1;
  });
  if (!updated) redirect("/login");
  await startSession(updated);
  notify(accountNoticeEmail(owner.email, "Your password was changed", `The password for ${owner.email} was just changed, and other devices were signed out.`));
  return { ok: true, message: "Password changed. Your other devices have been signed out." };
}

export async function requestEmailChange(_prev: AccountState, form: FormData): Promise<AccountState> {
  const owner = await requireAccountHolder();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, message: "Enter a valid email." };
  if (email === owner.email) return { ok: false, message: "That's already your sign-in email." };
  const wrong = await checkPassword(owner, String(form.get("current") ?? ""));
  if (wrong) return { ok: false, message: wrong };
  if (await overLimit(`email-change:${owner.id}`, MAX_EMAIL_CHANGES_PER_HOUR, 60 * 60 * 1000))
    return { ok: false, message: "Too many email change requests. Wait an hour and try again." };

  // Whether another account uses the address is only checked when the link is
  // opened, so this form can't be used to find out who has an account.
  const link = `${await siteUrl()}/account/confirm-email/${createEmailChangeToken(owner, email)}`;
  const sent = await sendMail(emailChangeEmail(email, link, EMAIL_CHANGE_MINUTES));
  if (!sent.ok) return { ok: false, message: "We couldn't send to that address. Check it and try again." };
  return { ok: true, message: `We sent a link to ${email}. Your sign-in email changes once you open it (within ${EMAIL_CHANGE_MINUTES} minutes).` };
}

export async function deleteAccount(_prev: AccountState, form: FormData): Promise<AccountState> {
  const owner = await requireAccountHolder();
  if (String(form.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase() !== owner.handle)
    return { ok: false, message: `Type your page name, ${owner.handle}, to confirm.` };
  const wrong = await checkPassword(owner, String(form.get("current") ?? ""));
  if (wrong) return { ok: false, message: wrong };

  // Customers with bookings still to come must hear about it, which cancelling does.
  const today = facilityNow().date;
  const upcoming = (await listBookings({ ownerId: owner.id })).filter((b) => holdsSlot(b) && b.date >= today);
  if (upcoming.length > 0) {
    const n = upcoming.length;
    return {
      ok: false,
      message: `You have ${n} upcoming booking${n === 1 ? "" : "s"}. Cancel ${n === 1 ? "it" : "them"} in Bookings first (each customer is emailed), then delete your account.`,
    };
  }

  const [settings, hero, events] = await Promise.all([readSettings(owner.id), readHero(owner.id), readEvents(owner.id)]);
  const uploads = [settings.qrPhoto, ...hero.library, ...events.map((e) => e.photo)].filter((n): n is string => !!n);

  await deleteOwner(owner.id);
  // Files go after the records, so a failure here leaves unused files, never broken pages.
  await Promise.all(uploads.map((name) => deleteUpload(name)));
  for (const tag of [OWNERS_TAG, activitiesTag(owner.id), eventsTag(owner.id), heroTag(owner.id)]) updateTag(tag);

  notify(
    accountNoticeEmail(
      owner.email,
      "Your account was deleted",
      `The ${platform.name} account for @${owner.handle} (${maskEmail(owner.email)}) and its bookings, activities, events, photos and settings were deleted. This can't be undone.`,
    ),
  );
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
