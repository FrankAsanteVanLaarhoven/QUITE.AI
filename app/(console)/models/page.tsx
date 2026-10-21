import type { Metadata } from "next";
import { ModelsScreen } from "@/components/screens/models";

export const metadata: Metadata = { title: "Model catalogue" };

export default function Page() {
  return <ModelsScreen />;
}
