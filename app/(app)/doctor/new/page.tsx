import { requireRole } from "@/lib/session";
import { testsFor } from "@/lib/queries";
import { NewReferralForm } from "./NewReferralForm";

export default async function NewReferralPage() {
  const u = await requireRole("doctor");
  const tests = await testsFor(u.hospital_id!);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New test referral</h1>
        <p className="text-sm text-slate-500">
          {u.hospital_name}: send the test to partner labs nearby. The patient keeps their original slot until the test is done.
        </p>
      </div>
      <NewReferralForm tests={tests as { id: string; name_en: string; current_wait_days: number | null }[]} />
    </div>
  );
}
