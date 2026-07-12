import type { Metadata } from "next";
import { GameClient } from "./game/GameClient";

export const metadata: Metadata = {
  title: "SLOTH / PARK — A Central Park Survival Adventure",
  description:
    "Cross a living, cinematic Central Park as a displaced sloth. Follow the canopy, forage carefully, and reach the sanctuary before nightfall.",
};

export default function Home() {
  return <GameClient />;
}
