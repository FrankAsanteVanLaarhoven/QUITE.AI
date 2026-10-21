import type { Metadata } from "next";
import { ApprovalsScreen } from "@/components/screens/approvals";

export const metadata: Metadata = { title: "Approval inbox" };

export default function Page() {
  return <ApprovalsScreen />;
}
