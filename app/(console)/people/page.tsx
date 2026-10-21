import type { Metadata } from "next";
import { PeopleScreen } from "@/components/screens/people";

export const metadata: Metadata = { title: "People" };

export default function Page() {
  return <PeopleScreen />;
}
