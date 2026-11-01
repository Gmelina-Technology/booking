import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { sendMail } from "@/lib/mailer";

const mail = { to: "juan@example.test", subject: "Booking B1", html: "<p>Hi</p>", text: "Hi" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The result is shown to partners, so it never names the recipient or a server path.
test("without SMTP, the email is saved locally and the result stays generic", async () => {
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("VERCEL", "");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const result = await sendMail(mail);
  expect(result).toEqual({ ok: true, detail: "Email saved, not sent: email delivery isn't set up" });
  // The file's location goes to the server log instead.
  const file = String(log.mock.calls[0][0]).match(/data\/outbox\/(\S+)/)![1];
  const saved = path.join(process.cwd(), "data", "outbox", file);
  expect(await readFile(saved, "utf8")).toContain("Booking B1");
  await rm(saved);
});

test("on Vercel without SMTP, sending fails with a generic message", async () => {
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("VERCEL", "1");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await sendMail(mail);
  expect(result).toEqual({ ok: false, detail: "Email not sent: email delivery isn't set up" });
  expect(result.detail).not.toContain("juan@");
});
