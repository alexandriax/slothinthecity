import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Sloth in the City — A New York City Adventure";
const description = "Play as a displaced sloth in a cinematic first-person New York City adventure. Forage and climb through Central Park, navigate the subway, and find your friends at the Bronx Zoo.";
const socialImage = "/social/sloth-in-the-city-og-v2.jpg";
const siteUrl = process.env.SITE_URL ?? "https://www.slothinthecity.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Sloth in the City",
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    siteName: "Sloth in the City",
    locale: "en_US",
    images: [{ url: socialImage, width: 1200, height: 630, type: "image/jpeg", alt: "First-person view of a sloth crossing the Central Park canopy at golden hour beside the Sloth in the City title." }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: socialImage, alt: "First-person view of a sloth crossing the Central Park canopy at golden hour beside the Sloth in the City title." }],
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
