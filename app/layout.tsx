import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "SLOTH / PARK — A Central Park Survival Adventure";
const description = "Play as a displaced sloth in a cinematic first-person Central Park adventure. Forage, climb, swim, evade hawks, and find sanctuary before nightfall.";
const socialImage = "/social/sloth-park-og-v2.jpg";
const siteUrl = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "SLOTH / PARK",
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    siteName: "SLOTH / PARK",
    locale: "en_US",
    images: [{ url: socialImage, width: 1200, height: 630, type: "image/jpeg", alt: "First-person view of a sloth crossing the Central Park canopy at golden hour beside the SLOTH / PARK title." }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: socialImage, alt: "First-person view of a sloth crossing the Central Park canopy at golden hour beside the SLOTH / PARK title." }],
  },
  robots: { index: true, follow: true },
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
