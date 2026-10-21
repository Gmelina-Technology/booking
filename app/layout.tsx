import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { platform } from "@/lib/facility";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${platform.name} — Book a court`, template: `%s · ${platform.name}` },
  description: platform.tagline,
};

// Headers and footers live in the nested layouts: app/(platform)/layout.tsx for
// the platform's own pages, app/p/[handle]/layout.tsx for each business page.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
