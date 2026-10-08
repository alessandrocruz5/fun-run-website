import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const description =
  "Riverline Run, a fictional fun run by the fictional Clearwater Collective. A portfolio project in test mode: no real event and no real payments.";

export const metadata: Metadata = {
  title: "Riverline Run",
  description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
