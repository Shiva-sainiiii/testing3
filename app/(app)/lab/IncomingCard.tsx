"use client";

import { useState, useTransition } from "react";
import { acceptReferral, declineReferral } from "@/app/actions";
import { useIdemKey } from "@/lib/useLive";
import { relTime } from "@/lib/format";
import { Card, PriorityChip, ScoreBreakdown, TempMedBadge, btnPrimary, btnSecondary, input, type Score } from "@/components/ui";
import type { Toast } from "./LabDesk";

export type Incoming = {
  id: number; code: string; test_type_id: string; test_name: string; priority: string; on_temp_medication: boolean;
  note: string; distance_km: number; round: number; is_free: boolean | null; price_inr: number | null;
  current_wait_days: number | null; expires_at: string; created_at: string; from_name: string; score: Score;
};

/** "YYYY-MM-DDT10:00" for tomorrow in IST, based on the (demo) server clock. */
function tomorrow10(serverNow: number) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(serverNow + 24 * 3600 * 1000));
  return `${d}T10:00`;
}

export function IncomingCard({ r, serverNow, onResult }: { r: Incoming; serverNow: number; onResult: (t: Toast) => void }) {
  const [slot, setSlot] = useState(() => tomorrow10(serverNow));
  const [pending, start] = useTransition();
  const [idem, rotateIdem] = useIdemKey();
  const isNew = serverNow - new Date(r.created_at).getTime() < 15_000;

  const accept = () =>
    start(async () => {
      try {
        const res = await acceptReferral(r.id, slot, idem); // same key on double-click/retry → same answer
        rotateIdem();
        onResult(res.ok
          ? { kind: "success", text: `${res.already ? "Already accepted by your lab" : "Accepted"} ${r.code}. Patient notified by SMS. See “Booked / today”.` }
          : { kind: "error", text: `${r.code}: ${res.message}` });
      } catch {
        onResult({ kind: "error", text: "Network problem. Press Accept again; it is safe to retry." });
      }
    });

  const decline = () =>
    start(async () => {
      const res = await declineReferral(r.id, "No capacity", idem);
      rotateIdem();
      onResult(res.ok ? { kind: "info", text: `Declined ${r.code}` } : { kind: "error", text: res.message ?? "Failed" });
    });

  return (
    <Card className={isNew ? "flash-in ring-2 ring-amber-300" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{r.test_name}</span>
            <PriorityChip p={r.priority} />
            {r.on_temp_medication && <TempMedBadge />}
            {isNew && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-white">NEW</span>}
          </div>
          <div className="text-sm text-slate-600">
            {r.code} · from {r.from_name} · <b>{r.distance_km} km</b> for the patient ·{" "}
            {r.is_free ? "Free at your lab (govt)" : `₹${r.price_inr} at your lab`}
            {r.round > 1 && " · widened search"}
          </div>
          {r.note && <div className="text-sm text-slate-800">“{r.note}”</div>}
          <ScoreBreakdown score={r.score} />
          <div className="text-xs text-slate-500">
            Patient identity is shared only after you accept · offer closes {relTime(r.expires_at, serverNow)}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <label className="text-xs text-slate-600">Slot you can offer (IST)
            <input type="datetime-local" className={input} value={slot} onChange={(e) => setSlot(e.target.value)} />
          </label>
          <button className={btnPrimary} disabled={pending} onClick={accept}>
            {pending ? "Accepting…" : "Accept"}
          </button>
          <button className={`${btnSecondary} !py-1 text-xs`} disabled={pending} onClick={decline}>Decline</button>
        </div>
      </div>
    </Card>
  );
}
