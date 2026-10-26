"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { clientIp, startSession } from "@/lib/auth";
import { passwordResetEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";
import { hashPassword } from "@/lib/password";
import { createResetToken, ownerForResetToken, RESET_MINUTES, resetTokenMatches } from "@/lib/password-reset";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { overLimit } from "@/lib/rate-limit";
import { authConfigured } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { clearLoginFailures, getOwnerByEmail, updateOwner } from "@/lib/store";

// Forgotten passwords. Step 1 emails a link (lib/password-reset.ts); step 2,
// on /reset-password/<token>, sets the new password and signs the owner in.
// Step 1 never says whether an account exists, and both steps are rate-limited.

const HOUR_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 5;
const MAX_REQUESTS_PER_EMAIL = 3;

export type RequestResetState = { error: string | null; sent: boolean; email: string };

export async function requestPasswordReset(_prev: RequestResetState, form: FormData): Promise<RequestResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fail = (error: string): RequestResetState => ({ error, sent: false, email });
  if (!authConfigured()) return fail("Password reset isn't set up on this server yet (SESSION_SECRET is missing).");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email.");

  if (
    (await overLimit(`reset-send:${await clientIp()}`, MAX_REQUESTS_PER_IP, HOUR_MS)) ||
    (await overLimit(`reset-send-email:${email}`, MAX_REQUESTS_PER_EMAIL, HOUR_MS))
  )
    return fail("Too many reset requests. Please wait an hour and try again.");

  const owner = await getOwnerByEmail(email);
  if (owner) {
    const link = `${await siteUrl()}/reset-password/${createResetToken(owner)}`;
    // Sent after the response, so a known email doesn't answer slower than an unknown one.
    after(async () => {
      const result = await sendMail(passwordResetEmail(owner.email, link, RESET_MINUTES));
      if (!result.ok) console.error("Password reset email failed:", result.detail);
    });
  }
  return { error: null, sent: true, email };
}

class LinkUsed extends Error {}

export async function resetPassword(_prev: string | null, form: FormData): Promise<string | null> {
  if (!authConfigured()) return "Password reset isn't set up on this server yet (SESSION_SECRET is missing).";
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 200) return "That password is too long.";
  if (password !== String(form.get("confirm") ?? "")) return "The two passwords don't match.";

  const expired = "This reset link has expired or was already used. Ask for a new one.";
  const owner = await ownerForResetToken(token);
  if (!owner) return expired;

  const passwordHash = await hashPassword(password);
  try {
    await updateOwner(owner.id, (o) => {
      // Re-checked under the lock, so two tabs can't both use one link.
      if (!resetTokenMatches(o, token)) throw new LinkUsed();
      o.passwordHash = passwordHash;
    });
  } catch (err) {
    if (err instanceof LinkUsed) return expired;
    throw err;
  }

  await clearLoginFailures(await clientIp());
  await startSession(owner.id);
  redirect("/admin");
}
