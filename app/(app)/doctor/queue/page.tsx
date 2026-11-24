import { requireRole } from "@/lib/session";
import { QueueView } from "./QueueView";

export default async function QueuePage() {
  const u = await requireRole("doctor");
  return <QueueView hospital={u.hospital_name ?? ""} />;
}
