import type { Metadata } from "next";
import { TeamsScreen } from "@/components/screens/teams";

export const metadata: Metadata = { title: "Teams and seats" };

export default function Page() {
  return <TeamsScreen />;
}
