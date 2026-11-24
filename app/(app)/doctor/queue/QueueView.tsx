"use client";

import Link from "next/link";
import { useLive } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";
import { Card } from "@/components/ui";
import { LiveBadge } from "@/components/LiveBadge";

type Row = {
  id: number; test_type_id: string; test_name: string; position: number; slot_at: string | null; status: string;
  patient_name: string; released_to: string | null; referral: string | null; updated_at: string;
};

const BADGE: Record<string, string> = {
  booked: "bg-sky-100 text-sky-900",
  waiting: "bg-amber-100 text-amber-900",
  held_backup: "bg-fuchsia-100 text-fuchsia-900",
  released: "bg-slate-200 text-slate-600",
};

export function QueueView({ hospital }: { hospital: string }) {
  const { data, stale, now } = useLive<Row[]>("/api/live?view=queue");
  const recent = (at: string) => now != null && new Date(now).getTime() - new Date(at).getTime() < 10_000;
  const tests = [...new Set((data ?? []).map((r) => r.test_type_id))];
  const releasedSlots = new Set((data ?? []).filter((r) => r.status === "released").map((r) => r.slot_at));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hospital queue</h1>
          <p className="text-sm text-slate-500">
            {hospital} diagnostic desk register. A referred patient&apos;s slot is held as a backup, then released to the next patient once their test is done elsewhere.
          </p>
        </div>
        <LiveBadge stale={stale} />
      </div>
      {tests.map((t) => {
        const rows = data!.filter((r) => r.test_type_id === t);
        return (
          <Card key={t} className="!p-0">
            <div className="border-b border-slate-100 px-4 py-2 font-semibold">{rows[0].test_name}</div>
            <table className="w-full table-fixed text-sm">
              <colgroup><col className="w-40" /><col className="w-48" /><col className="w-64" /><col /></colgroup>
              <tbody>
                {rows.map((r) => {
                  const [code, lab, rstatus] = r.referral?.split("|") ?? [];
                  const gotEarlier = r.status === "booked" && releasedSlots.has(r.slot_at);
                  return (
                    <tr key={`${r.id}-${r.status}`} className={`${recent(r.updated_at) ? "flash-in" : ""} border-t border-slate-100 ${gotEarlier ? "bg-emerald-50" : ""}`}>
                      <td className="w-40 px-4 py-2 text-slate-600">{r.slot_at ? fmtDT(r.slot_at) : "no date yet"}</td>
                      <td className={`px-4 py-2 ${r.status === "released" ? "text-slate-400 line-through" : "font-medium"}`}>{r.patient_name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE[r.status] ?? ""}`}>
                          {r.status === "held_backup" ? "held as backup" : r.status}
                        </span>
                        {gotEarlier && <span className="ml-2 text-xs font-semibold text-emerald-700">↑ got an earlier slot</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {code && (
                          <>
                            Referral {code}{lab ? ` → ${lab}` : ""} ({rstatus?.replace(/_/g, " ")})
                          </>
                        )}
                        {r.status === "released" && r.released_to && <> · slot given to <b>{r.released_to}</b></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
      {data?.length === 0 && <p className="text-slate-500">Queue is empty.</p>}
      <p className="text-xs text-slate-500">Reality check: most hospitals keep this register on paper. In a pilot the desk would keep it here. <Link className="underline" href="/doctor">Back</Link></p>
    </div>
  );
}
