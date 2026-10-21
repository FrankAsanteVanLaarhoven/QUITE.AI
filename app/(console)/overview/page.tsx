import type { Metadata } from "next";
import { OverviewScreen } from "@/components/screens/overview";

export const metadata: Metadata = { title: "Capacity this month" };

export default function Page() {
  return <OverviewScreen />;
}
