import { requireRole } from "@/lib/session";
import { DoctorHome } from "./DoctorHome";

export default async function DoctorPage() {
  const u = await requireRole("doctor");
  return <DoctorHome hospital={u.hospital_name ?? ""} />;
}
