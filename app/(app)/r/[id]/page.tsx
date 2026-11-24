import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { referralView } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { ReferralDetail } from "./ReferralDetail";

export default async function ReferralPage({ params }: PageProps<"/r/[id]">) {
  const u = await requireRole("doctor", "lab", "dho");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await referralView(u, id))) notFound();
  await one(`select tb.log_view($1, $2, 'referral')`, [u.id, id]); // every view is audited
  return <ReferralDetail id={id} role={u.role} />;
}
