import type { Metadata } from "next";
import { Archivo, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
});
const instrumentSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument-sans",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: { default: "Riverline Run organizer", template: "%s · Riverline Run organizer" },
  description: "Organizer dashboard for Riverline Run, a fictional fun run. Test data only.",
  robots: { index: false, follow: false },
};

/**
 * The root shell, shared by /login. The session check is in app/(dashboard)/layout.tsx, so that
 * /login stays reachable while signed out.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <aside aria-label="Test mode" className="banner mono">
          <p className="m-0 leading-[1.4]">
            <span aria-hidden="true">● </span>
            Fictional event · Test mode, no real payments
          </p>
        </aside>
        {children}
      </body>
    </html>
  );
}
