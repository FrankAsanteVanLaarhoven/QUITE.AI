import type { Metadata } from "next";
import { CreditsScreen } from "@/components/screens/credits";

export const metadata: Metadata = { title: "Credits" };

export default function Page() {
  return <CreditsScreen />;
}
