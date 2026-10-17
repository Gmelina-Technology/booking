import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Whether the current request carries a valid staff session. */
export async function isStaff(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/**
 * Call at the top of every staff-only server action and every admin data
 * component. proxy.ts only redirects page visits; server actions can be
 * invoked directly, so each one must check for itself.
 */
export async function requireStaff(): Promise<void> {
  if (!(await isStaff())) redirect("/login");
}
