import { requireRole } from "@/lib/session";
import { DhoView } from "./DhoView";

export default async function DhoPage() {
  await requireRole("dho");
  return <DhoView />;
}
