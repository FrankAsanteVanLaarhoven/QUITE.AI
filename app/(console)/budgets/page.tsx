import type { Metadata } from "next";
import { BudgetsScreen } from "@/components/screens/budgets";

export const metadata: Metadata = { title: "Budgets and export" };

export default function Page() {
  return <BudgetsScreen />;
}
