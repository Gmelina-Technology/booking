"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth";
import { defaultProfile } from "@/lib/facility";
import { handleError, OWNERS_TAG } from "@/lib/owners";
import { hashPassword } from "@/lib/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { authConfigured } from "@/lib/session";
import { insertOwner, readSettings, writeSettings } from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupState = { error: string | null; values: { name: string; handle: string; email: string } };

export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const fail = (error: string): SignupState => ({ error, values: { name, handle, email } });

  if (!authConfigured()) return fail("Sign-up isn't set up on this server yet (SESSION_SECRET is missing). See the README.");
  if (name.length < 2) return fail("Enter your business name.");
  const badHandle = handleError(handle);
  if (badHandle) return fail(`Page name: ${badHandle}`);
  if (!EMAIL.test(email)) return fail("Enter a valid email.");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 200) return fail("That password is too long.");

  const { result, owner } = await insertOwner({
    handle,
    email,
    passwordHash: await hashPassword(password),
    profile: defaultProfile(name, email),
  });
  if (result === "handle_taken") return fail(`@${handle} is taken. Try another page name.`);
  if (result === "email_taken") return fail("There's already an account with that email. Sign in instead.");

  // Send new-booking alerts to the owner unless adopted settings already say where.
  const settings = await readSettings(owner!.id);
  if (!settings.staffNotifyEmail) await writeSettings(owner!.id, { ...settings, staffNotifyEmail: email });

  updateTag(OWNERS_TAG);
  await startSession(owner!.id);
  redirect("/admin/business?welcome=1");
}
