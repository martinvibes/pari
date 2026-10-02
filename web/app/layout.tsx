// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import "./globals.css";
import { SITE } from "@/lib/site";

// metadataBase resolves the icon and opengraph-image file conventions in
// app/ to absolute URLs, which is what link unfurlers require.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    url: SITE.url,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
};

// The root layout only owns the document shell. The marketing surface, the
// docs and the working app each provide their own chrome via route layouts.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
