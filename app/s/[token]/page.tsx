import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { statusView } from "@/lib/queries";
import { StatusView } from "./StatusView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TestBridge: आपकी जाँच / Your test", robots: { index: false } };

// Public patient status page: no login, opened from the SMS link or the slip's QR code.
export default async function StatusPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  if (!(await statusView(token))) notFound();
  return <StatusView token={token} />;
}
