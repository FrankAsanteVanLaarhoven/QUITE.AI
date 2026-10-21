import type { Metadata } from "next";
import { RequestsScreen } from "@/components/screens/requests";

export const metadata: Metadata = { title: "Routing decisions" };

export default function Page() {
  return <RequestsScreen />;
}
