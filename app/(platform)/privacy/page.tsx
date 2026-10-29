import type { Metadata } from "next";
import Link from "next/link";
import { platform } from "@/lib/facility";
import { LegalPage, PrivacyContact } from "../legal";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice">
      <p>
        {platform.name} is run by {platform.operator}. Sports facilities use it to publish a booking page and manage their bookings. This
        notice explains what personal information we handle, why, and your rights under the Philippine Data Privacy Act of 2012 (Republic Act
        No. 10173).
      </p>

      <h2>Who is responsible for your information</h2>
      <ul>
        <li>
          <strong>If you book a court,</strong> the facility you book with decides how your booking details are used. It is the personal
          information controller. {platform.operator} stores and processes those details on the facility&apos;s behalf.
        </li>
        <li>
          <strong>If you run a facility on {platform.name},</strong> {platform.operator} is the controller of your account information.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Customers:</strong> your name, email, phone number, number of players, any notes you add, the court and time you book, and the
          payment reference number you enter after paying.
        </li>
        <li>
          <strong>Facility owners:</strong> your sign-in email, a scrambled (hashed) form of your password, your business details, and the
          photos, activities, events and settings you add.
        </li>
        <li>
          <strong>Everyone:</strong> your IP address, used only to limit repeated attempts (for example, too many sign-in tries or booking
          requests). These records expire an hour after the last attempt.
        </li>
      </ul>
      <p>
        We use one cookie, and only for facility staff: it keeps you signed in. Sign-up also uses a short-lived cookie while you confirm your
        email. There are no advertising or tracking cookies.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To hold your court, send you booking, payment and cancellation emails, and let the facility manage your booking.</li>
        <li>To run facility accounts: signing in, password resets and account notices.</li>
        <li>To keep the service secure and stop abuse.</li>
      </ul>
      <p>We don&apos;t sell personal information or use it for advertising.</p>

      <h2>Payments</h2>
      <p>
        You pay the facility directly, for example through GCash or Maya. {platform.name} doesn&apos;t process or see your payment. We only
        store the reference number you type in, so the facility can match your payment.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li>The facility you book with, which sees your booking and contact details.</li>
        <li>
          Service providers that run the site for us: web hosting and file storage (Vercel), the database (Neon) and the email service that
          delivers our emails. They may store data outside the Philippines, and they may only use it to provide their service to us.
        </li>
        <li>Authorities, when the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Booking details stay until the facility erases them or deletes its account.</li>
        <li>A facility&apos;s account, with all its bookings, photos and settings, stays until the owner deletes it from the Account page.</li>
        <li>Rate-limit records with IP addresses expire an hour after the last attempt.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to be informed about, access, correct, or erase your personal information, object to its processing, and get a copy of it.
        For a booking, contact the facility first: staff can correct or erase your details. You can also write to us at <PrivacyContact />{" "}
        and we&apos;ll pass your request on or handle it ourselves. If you believe your rights were violated, you can complain to the National
        Privacy Commission (privacy.gov.ph).
      </p>

      <h2>How we protect it</h2>
      <p>
        The site is served over HTTPS. Passwords are stored only in hashed form. Each facility can see only its own bookings, and staff
        accounts can be signed out on every device at once.
      </p>

      <h2>Changes</h2>
      <p>
        We&apos;ll update this page if our practices change, and change the date at the top. See also our{" "}
        <Link href="/terms" className="font-semibold text-emerald-700 hover:underline">
          terms of service
        </Link>
        .
      </p>
    </LegalPage>
  );
}
