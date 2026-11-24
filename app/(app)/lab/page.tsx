import { requireRole } from "@/lib/session";
import { LabDesk } from "./LabDesk";

export default async function LabPage() {
  const u = await requireRole("lab");
  return <LabDesk hospital={u.hospital_name ?? ""} />;
}
