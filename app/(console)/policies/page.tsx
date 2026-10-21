import type { Metadata } from "next";
import { PoliciesScreen } from "@/components/screens/policies";

export const metadata: Metadata = { title: "Routing policies" };

export default function Page() {
  return <PoliciesScreen />;
}
