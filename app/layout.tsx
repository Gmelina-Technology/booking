import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { facility } from "@/lib/facility";
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
  title: { default: `${facility.name} — Book a court`, template: `%s · ${facility.name}` },
  description: facility.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white">C</span>
              {facility.name}
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/#activities" className="hidden rounded-lg px-3 py-2 hover:bg-black/5 sm:block">
                Activities
              </Link>
              <Link
                href="/#activities"
                className="ml-1 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800"
              >
                Book now
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/5 bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-black/60 sm:grid-cols-3">
            <div>
              <p className="font-semibold text-black">{facility.name}</p>
              <p className="mt-1">{facility.tagline}</p>
            </div>
            <div>
              <p className="font-semibold text-black">Visit</p>
              <p className="mt-1">{facility.address}</p>
            </div>
            <div>
              <p className="font-semibold text-black">Contact</p>
              <p className="mt-1">{facility.phone}</p>
              <p>{facility.email}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
