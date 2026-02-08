import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
      <body className="antialiased">
        <header className="header-entrance sticky top-0 z-50 border-b border-rule bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
            <Link href="/" className="flex items-baseline gap-2 no-underline">
              <span className="logo-hover font-display text-[22px] italic tracking-tight text-on-dark">
                ChalkBoard
              </span>
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.25em] text-cinnabar">
                live
              </span>
            </Link>

            <nav className="flex items-center font-mono text-[11px] tracking-wide">
              <Link
                href="/"
                className="nav-link px-3 py-1 text-graphite transition-colors duration-200 hover:text-on-dark"
              >
                join
              </Link>
              <span className="px-1.5 text-rule select-none">/</span>
              <Link
                href="/rooms"
                className="nav-link px-3 py-1 text-graphite transition-colors duration-200 hover:text-on-dark"
              >
                rooms
              </Link>
              <span className="px-1.5 text-rule select-none">/</span>
              <Link
                href="/professor"
                className="nav-link px-3 py-1 text-graphite transition-colors duration-200 hover:text-on-dark"
              >
                professor
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
