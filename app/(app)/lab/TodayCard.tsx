"use client";

import { useState, useTransition } from "react";
import { revealPatient, transition } from "@/app/actions";
import { useIdemKey } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";
import { Card, PriorityChip, StatusChip, TempMedBadge, btnDanger, btnPrimary, btnSecondary, input } from "@/components/ui";
import type { Toast } from "./LabDesk";

export type Today = {
  id: number; code: string; test_type_id: string; test_name: string; priority: string; on_temp_medication: boolean;
  status: string; accepted_slot_at: string; from_name: string; note: string;
};
type Patient = { display_name: string; phone: string; abha_id: string | null; age: number | null };

export function TodayCard({ r, onResult }: { r: Today; onResult: (t: Toast) => void }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [pending, start] = useTransition();
  const [idem, rotateIdem] = useIdemKey();
  const [reportedBy, setReportedBy] = useState("");
  const [regNo, setRegNo] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const canArrive = r.status === "accepted" || r.status === "patient_confirmed";
  const canDone = r.status === "arrived";
  const canUpload = r.status === "test_done";

  const step = (to: string, label: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      try {
        const res = await transition(r.id, to, idem);
        rotateIdem();
        onResult(res.ok ? { kind: "success", text: `${r.code}: ${label}` } : { kind: "error", text: `${r.code}: ${res.message}` });
      } catch {
        onResult({ kind: "error", text: "Network problem, try again (safe to retry)." });
      }
    });
  };

  const show = () => start(async () => setPatient((await revealPatient(r.id)) as Patient | null));

  const useSample = () =>
    start(async () => {
      const blob = await (await fetch("/sample-report.pdf")).blob();
      setFile(new File([blob], `${r.code}-report.pdf`, { type: "application/pdf" }));
      setReportedBy("Dr. R. Sinha (fictional)");
      setRegNo("HMC-12345");
    });

  const upload = () =>
    start(async () => {
      if (!file) return onResult({ kind: "error", text: "Choose a PDF first" });
      const fd = new FormData();
      fd.set("file", file);
      fd.set("reported_by", reportedBy);
      fd.set("reg_no", regNo);
      fd.set("idem", idem);
      try {
        const res = await (await fetch(`/api/reports/${r.id}`, { method: "POST", body: fd })).json();
        rotateIdem();
        onResult(res.ok
          ? { kind: "success", text: `${r.code}: report sent to the referring doctor (${res.days_earlier} days earlier than their queue).` }
          : { kind: "error", text: `${r.code}: ${res.message}` });
      } catch {
        onResult({ kind: "error", text: "Upload failed (network). Try again; it will not duplicate." });
      }
    });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{fmtDT(r.accepted_slot_at)}</span>
            <span className="font-semibold">{r.test_name}</span>
            <StatusChip status={r.status} />
            <PriorityChip p={r.priority} />
            {r.on_temp_medication && <TempMedBadge />}
          </div>
          <div className="text-sm text-slate-600">{r.code} · referred by {r.from_name}{r.note && <> · “{r.note}”</>}</div>
          {patient ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <b>{patient.display_name}</b>{patient.age ? `, ${patient.age}` : ""} · 📱 {patient.phone}
              {patient.abha_id && <> · ABHA {patient.abha_id}</>}
              <span className="ml-2 text-xs text-slate-500">(this view is logged)</span>
            </div>
          ) : (
            <button className="text-sm text-teal-700 underline" disabled={pending} onClick={show}>Show patient details</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={pending || !canArrive} onClick={() => step("arrived", "patient arrived")}>Arrived</button>
          <button className={btnPrimary} disabled={pending || !canDone} onClick={() => step("test_done", "test done; original slot released at referring hospital")}>Test done</button>
          <button className={btnDanger} disabled={pending || !canArrive}
            onClick={() => step("no_show", "marked no-show; request offered to labs again", "Mark as no-show? The request goes back to open; the patient keeps their original slot.")}>
            No-show
          </button>
        </div>
      </div>

      {canUpload && (
        <div className="mt-3 grid gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="text-xs">Report PDF
            <input type="file" accept="application/pdf" className={`${input} !py-1`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <span className="text-teal-800">{file.name}</span>}
          </label>
          <label className="text-xs">Reporting doctor
            <input className={input} value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Dr. …" />
          </label>
          <label className="text-xs">Registration no.
            <input className={input} value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="State council reg." />
          </label>
          <div className="flex flex-col justify-end gap-1">
            <button className={btnPrimary} disabled={pending || !file} onClick={upload}>Upload & send</button>
            <button className={`${btnSecondary} !py-1 text-xs`} disabled={pending} onClick={useSample}>Use sample report</button>
          </div>
        </div>
      )}
    </Card>
  );
}
