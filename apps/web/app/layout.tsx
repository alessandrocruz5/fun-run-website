import type { Metadata } from "next";
import { Archivo, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Footer } from "@/components/sections/footer";
import { Header } from "@/components/sections/header";
import { TestModeBanner } from "@/components/test-mode-banner";
import { getSiteUrl, NAV_LINKS, SITE } from "@/content/site";
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

const title = `${SITE.name} ${SITE.edition} — ${SITE.city}`;

// SITE_URL is read per request (connection() opts out of prerendering), never at build time.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: title, template: `%s · ${SITE.name}` },
    description: SITE.description,
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description: SITE.description,
      locale: "en_PH",
    },
    twitter: { card: "summary_large_image", title, description: SITE.description },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <TestModeBanner />
        <Header links={NAV_LINKS} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
