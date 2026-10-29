import type { Metadata } from "next";
import Link from "next/link";
import { platform } from "@/lib/facility";
import { LegalPage, PrivacyContact } from "../legal";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover your use of {platform.name}, run by {platform.operator}. By booking a court or creating a facility page, you agree to
        them. How we handle personal information is explained in our{" "}
        <Link href="/privacy" className="font-semibold text-emerald-700 hover:underline">
          privacy notice
        </Link>
        .
      </p>

      <h2>What {platform.name} does</h2>
      <p>
        {platform.name} lets sports facilities publish a booking page, and lets customers request courts. Each booking is an agreement between
        the customer and the facility. {platform.operator} provides the software, and is not a party to bookings or payments.
      </p>

      <h2>Booking a court</h2>
      <ul>
        <li>A request holds the slot while the facility reviews it. The facility may approve or decline it.</li>
        <li>
          Once approved, you pay the downpayment directly to the facility within the time shown, and enter your payment reference. Unpaid
          bookings, and requests the facility doesn&apos;t review in time, are cancelled automatically and the slot is released.
        </li>
        <li>Prices, the downpayment, cancellations and refunds are set by each facility. Contact the facility about them.</li>
        <li>Give accurate contact details, so the facility can reach you about your booking.</li>
      </ul>

      <h2>Running a facility page</h2>
      <ul>
        <li>Keep your business details, prices, opening hours and payment instructions accurate.</li>
        <li>
          You are responsible for your customers&apos; bookings, payments and refunds, and for handling their personal information lawfully,
          including requests to correct or erase it.
        </li>
        <li>Keep your password safe. You are responsible for what happens under your account.</li>
        <li>Only upload photos and text you have the right to use, and nothing unlawful, misleading or offensive.</li>
        <li>You can delete your account at any time from the Account page. This deletes your page and all its data.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t misuse the service: no fake bookings, holding slots you don&apos;t intend to use, scraping, attempts to get into other
        accounts, or interfering with the site. We may limit, suspend or remove accounts and pages that break these terms.
      </p>

      <h2>Availability and liability</h2>
      <p>
        We work to keep {platform.name} running and your data safe, but the service is provided as it is, without guarantees that it will
        always be available or error-free. To the extent the law allows, {platform.operator} is not liable for losses arising from bookings,
        payments or disputes between customers and facilities, or from the service being unavailable.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date at the top when we do. These terms are governed by the laws of the Philippines.
        Questions? Write to <PrivacyContact />.
      </p>
    </LegalPage>
  );
}
