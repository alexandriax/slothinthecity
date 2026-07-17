import type { Metadata } from "next";
import { AnimalShowroom } from "./AnimalShowroom";

export const metadata: Metadata = {
  title: "Zoo Animal Lab · Sloth in the City",
  robots: { index: false, follow: false },
};

export default function AnimalDebugPage() {
  return <AnimalShowroom />;
}
