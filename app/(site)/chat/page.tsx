import type { Metadata } from "next";
import { cookies } from "next/headers";
import { findSession } from "@/lib/auth";
import { ChatStudio } from "@/components/screens/chat";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  const jar = await cookies();
  const user = await findSession(jar.get("quiet_session")?.value).catch(() => null);
  return (
    <main className="site-wrap page-top">
      <p className="label">Chat</p>
      <h1 className="section-title">One composer. The policy still chooses.</h1>
      <p className="lede">Text is routed and priced. Images, video, and audio stay in this interface and do not generate until a model for that modality is allowed.</p>
      <ChatStudio signedIn={Boolean(user)} role={user?.role ?? ""} />
    </main>
  );
}
