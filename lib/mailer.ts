import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export type MailImage = { cid: string; filename: string; content: Buffer; contentType: string };
export type Mail = { to: string; replyTo?: string; subject: string; html: string; text: string; images?: MailImage[] };
/**
 * `detail` is shown to partners (toasts, a booking's email log), so it stays generic: never the
 * recipient, a server path or the SMTP error. Those go to the server log only.
 */
export type MailResult = { ok: boolean; detail: string };

const OUTBOX_DIR = path.join(process.cwd(), "data", "outbox");

/**
 * True when SMTP is configured. Otherwise mail is saved to data/outbox for
 * preview in local development; on Vercel (no writable disk) sending fails.
 */
export function smtpConfigured() {
  return !!process.env.SMTP_HOST;
}

let transport: Transporter | null = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    // Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends an email. Never throws: failures are returned so staff can see and retry. */
export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!smtpConfigured()) {
    if (process.env.VERCEL) {
      console.error("sendMail: SMTP_HOST is missing, nothing was sent");
      return { ok: false, detail: "Email not sent: email delivery isn't set up" };
    }
    return saveToOutbox(mail);
  }
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.images?.map((img) => ({ ...img })),
    });
    return { ok: true, detail: "Email sent" };
  } catch (err) {
    console.error("sendMail failed", err);
    return { ok: false, detail: "Email couldn't be sent" };
  }
}

async function saveToOutbox(mail: Mail): Promise<MailResult> {
  // Inline the images as data URIs so the saved file previews in a browser.
  let html = mail.html;
  for (const img of mail.images ?? []) {
    html = html.replaceAll(`cid:${img.cid}`, `data:${img.contentType};base64,${img.content.toString("base64")}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTo = mail.to.replace(/[^a-z0-9@._-]/gi, "_");
  const file = `${stamp}_${safeTo}.html`;
  await mkdir(OUTBOX_DIR, { recursive: true });
  await writeFile(
    path.join(OUTBOX_DIR, file),
    `<!-- To: ${mail.to}\n     Subject: ${mail.subject} -->\n${html}`,
  );
  console.info(`sendMail: SMTP not set up, saved to data/outbox/${file}`);
  return { ok: true, detail: "Email saved, not sent: email delivery isn't set up" };
}
