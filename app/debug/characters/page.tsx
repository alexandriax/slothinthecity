import type { Metadata } from "next";
import { CharacterShowroom } from "./CharacterShowroom";

export const metadata: Metadata = {
  title: "Human Character Lab · Sloth in the City",
  robots: { index: false, follow: false },
};

export default function CharacterDebugPage() {
  return <CharacterShowroom />;
}
