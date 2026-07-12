import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "SLOTH / PARK",
  description: "A first-person Central Park survival adventure.",
  openGraph: {
    title: "SLOTH / PARK",
    description: "Cross a living Central Park as a displaced sloth before nightfall.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "A sloth crossing Central Park at golden hour" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SLOTH / PARK",
    description: "A first-person Central Park survival adventure.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07100d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
