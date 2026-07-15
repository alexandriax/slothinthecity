import { redirect } from "next/navigation";

export default function DebugIndexPage() {
  redirect("/debug/characters");
}
