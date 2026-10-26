"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, startSession } from "@/lib/auth";
import { signupCodeEmail } from "@/lib/emails";
import { defaultProfile } from "@/lib/facility";
import { sendMail } from "@/lib/mailer";
import { handleError, OWNERS_TAG } from "@/lib/owners";
import { hashPassword } from "@/lib/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { authConfigured } from "@/lib/session";
import {
  CODE_MINUTES,
  codeMatches,
  maskEmail,
  newCode,
  openPendingSignup,
  PENDING_SIGNUP_COOKIE,
  sealPendingSignup,
  type PendingSignup,
} from "@/lib/signup-verification";
import {
  clearRateLimit,
  getOwnerByEmail,
  getOwnerByHandle,
  getRateLimit,
  hitRateLimit,
  insertOwner,
  readSettings,
  writeSettings,
} from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sign-up is two steps: details, then the 6-digit code emailed to the owner
// (see lib/signup-verification.ts). These limits stop one visitor from
// flooding inboxes or guessing codes.
const MAX_CODES_PER_IP = 5;
const MAX_CODES_PER_EMAIL = 3;
const CODE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_WRONG_CODES = 5;

type Values = { name: string; handle: string; email: string };

export type SignupState = {
  step: "details" | "verify";
  error: string | null;
  notice: string | null;
  /** Masked address the code went to, shown on the verify step. */
  sentTo: string;
  values: Values;
};

export async function signup(prev: SignupState, form: FormData): Promise<SignupState> {
  if (!authConfigured()) {
    return { ...prev, step: "details", notice: null, error: "Sign-up isn't set up on this server yet (SESSION_SECRET is missing). See the README." };
  }
  switch (form.get("intent")) {
    case "verify":
      return verifyCode(prev, String(form.get("code") ?? ""));
    case "resend":
      return resendCode(prev);
    case "restart":
      (await cookies()).delete({ name: PENDING_SIGNUP_COOKIE, path: "/signup" });
      return { ...prev, step: "details", error: null, notice: null };
    default:
      return startSignup(form);
  }
}

async function startSignup(form: FormData): Promise<SignupState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const values = { name, handle, email };
  const fail = (error: string): SignupState => ({ step: "details", error, notice: null, sentTo: "", values });

  // Hidden from people (see signup-form.tsx); form-filling bots tend to fill it in.
  if (String(form.get("website") ?? "") !== "") return fail("Something went wrong. Please try again.");
  if (name.length < 2) return fail("Enter your business name.");
  const badHandle = handleError(handle);
  if (badHandle) return fail(`Page name: ${badHandle}`);
  if (!EMAIL.test(email)) return fail("Enter a valid email.");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 200) return fail("That password is too long.");

  // Checked again when the account is created; this just avoids sending a code for a sign-up that can't succeed.
  if (await getOwnerByHandle(handle)) return fail(`@${handle} is taken. Try another page name.`);
  if (await getOwnerByEmail(email)) return fail("There's already an account with that email. Sign in instead.");

  const error = await sendCode({ name, handle, email, passwordHash: await hashPassword(password) });
  if (error) return fail(error);
  return { step: "verify", error: null, notice: null, sentTo: maskEmail(email), values };
}

/** Emails a new code and stores the pending sign-up in a cookie. Returns an error message, or null when sent. */
async function sendCode(details: Omit<PendingSignup, "code" | "nonce" | "exp">): Promise<string | null> {
  const ipKey = `signup-send:${await clientIp()}`;
  const emailKey = `signup-send-email:${details.email}`;
  const [byIp, byEmail] = await Promise.all([getRateLimit(ipKey), getRateLimit(emailKey)]);
  if ((byIp?.count ?? 0) >= MAX_CODES_PER_IP || (byEmail?.count ?? 0) >= MAX_CODES_PER_EMAIL) {
    return "Too many codes requested. Please wait an hour and try again.";
  }
  await Promise.all([hitRateLimit(ipKey, CODE_LIMIT_WINDOW_MS), hitRateLimit(emailKey, CODE_LIMIT_WINDOW_MS)]);

  const code = newCode();
  const sent = await sendMail(signupCodeEmail(details.email, code, CODE_MINUTES));
  if (!sent.ok) return "We couldn't send the verification email. Check the address and try again.";

  const { token } = sealPendingSignup(details, code);
  (await cookies()).set(PENDING_SIGNUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup",
    // Outlives the code so "Send a new code" still works after it expires.
    maxAge: 3 * CODE_MINUTES * 60,
  });
  return null;
}

async function verifyCode(prev: SignupState, raw: string): Promise<SignupState> {
  const pending = openPendingSignup((await cookies()).get(PENDING_SIGNUP_COOKIE)?.value);
  if (!pending) return { ...prev, step: "details", notice: null, error: "Your code has expired. Fill in your details again to get a new one." };
  const values = { name: pending.name, handle: pending.handle, email: pending.email };
  const fail = (error: string): SignupState => ({ step: "verify", error, notice: null, sentTo: maskEmail(pending.email), values });

  if (pending.exp <= Date.now()) return fail("That code has expired. Send a new one.");
  const attemptsKey = `signup-verify:${pending.nonce}`;
  if (((await getRateLimit(attemptsKey))?.count ?? 0) >= MAX_WRONG_CODES) return fail("Too many wrong codes. Send a new one.");

  const code = raw.replace(/\D/g, "");
  if (!codeMatches(pending.code, code)) {
    const { count } = await hitRateLimit(attemptsKey, CODE_MINUTES * 60_000);
    const left = MAX_WRONG_CODES - count;
    return fail(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Send a new one.");
  }

  const { result, owner } = await insertOwner({
    handle: pending.handle,
    email: pending.email,
    passwordHash: pending.passwordHash,
    profile: defaultProfile(pending.name, pending.email),
  });
  const jar = await cookies();
  jar.delete({ name: PENDING_SIGNUP_COOKIE, path: "/signup" });
  await clearRateLimit(attemptsKey);
  const back = (error: string): SignupState => ({ step: "details", error, notice: null, sentTo: "", values });
  if (result === "handle_taken") return back(`@${pending.handle} was just taken. Try another page name.`);
  if (result === "email_taken") return back("There's already an account with that email. Sign in instead.");

  // Send new-booking alerts to the owner unless adopted settings already say where.
  const settings = await readSettings(owner!.id);
  if (!settings.staffNotifyEmail) await writeSettings(owner!.id, { ...settings, staffNotifyEmail: pending.email });

  updateTag(OWNERS_TAG);
  await startSession(owner!);
  redirect("/admin/business?welcome=1");
}

async function resendCode(prev: SignupState): Promise<SignupState> {
  const pending = openPendingSignup((await cookies()).get(PENDING_SIGNUP_COOKIE)?.value);
  if (!pending) return { ...prev, step: "details", notice: null, error: "Your sign-up has expired. Fill in your details again." };
  const { name, handle, email, passwordHash } = pending;
  const error = await sendCode({ name, handle, email, passwordHash });
  return { step: "verify", error, notice: error ? null : "We sent a new code.", sentTo: maskEmail(email), values: { name, handle, email } };
}
