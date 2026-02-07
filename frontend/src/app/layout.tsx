import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChalkBoard Live",
  description: "Real-time lecture notes from chalkboard to screen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        <header className="sticky top-0 z-50 bg-stone-900 text-white shadow-lg">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-xl font-bold tracking-tight">
              ChalkBoard <span className="text-yellow-400">Live</span>
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-stone-700"
              >
                Student View
              </Link>
              <Link
                href="/professor"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-stone-700"
              >
                Professor View
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
