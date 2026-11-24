"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";
import { Alert, StatusChip } from "@/components/ui";
import { LiveBadge } from "@/components/LiveBadge";
import { IncomingCard, type Incoming } from "./IncomingCard";
import { TodayCard, type Today } from "./TodayCard";

type Missed = { id: number; code: string; test_type_id: string; priority: string; status: string; response: string | null; winner: string | null; updated_at: string };
type Done = { id: number; code: string; test_type_id: string; status: string; accepted_slot_at: string; from_name: string; uploaded_at: string | null };
type Data = { incoming: Incoming[]; missed: Missed[]; today: Today[]; done: Done[] };
export type Toast = { kind: "success" | "error" | "info"; text: string };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio blocked until first click: fine */
  }
}

export function LabDesk({ hospital }: { hospital: string }) {
  const { data, stale, error, refresh, now } = useLive<Data>("/api/live?view=lab");
  const [tab, setTab] = useState<"incoming" | "today" | "done">("incoming");
  const [toast, setToast] = useState<Toast | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const serverNow = now ? new Date(now).getTime() : 0; // data and now always arrive together

  // Sound when a new request arrives (not on first load).
  useEffect(() => {
    if (!data) return;
    const ids = data.incoming.map((r) => r.id);
    if (seen.current && ids.some((id) => !seen.current!.has(id))) beep();
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [data]);

  const notify = (t: Toast) => {
    setToast(t);
    refresh();
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 7000);
  };

  const tabs = [
    { id: "incoming", label: "Incoming requests", n: data?.incoming.length },
    { id: "today", label: "Booked / today", n: data?.today.length },
    { id: "done", label: "Done", n: data?.done.length },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lab desk</h1>
          <p className="text-sm text-slate-500">{hospital} · test requests from nearby hospitals</p>
        </div>
        <LiveBadge stale={stale} />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {toast && <div className="sticky top-24 z-10"><Alert kind={toast.kind}>{toast.text}</Alert></div>}

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}
            {t.n != null && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${t.id === "incoming" && t.n > 0 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "incoming" && (
        <div className="space-y-3">
          {data?.incoming.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No open requests right now. New ones appear here instantly.
            </p>
          )}
          {data?.incoming.map((r) => (
            <IncomingCard key={r.id} r={r} serverNow={serverNow} onResult={notify} />
          ))}
          {(data?.missed.length ?? 0) > 0 && (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recently closed for your lab</h3>
              <ul className="space-y-1">
                {data!.missed.map((m) => (
                  <li key={`${m.id}-${m.status}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <b>{m.code}</b> {m.test_type_id} ·
                    {m.response === "declined" ? " You declined" :
                      m.winner ? <span className="font-semibold text-rose-700">Already accepted by {m.winner}</span> :
                      <StatusChip status={m.status} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "today" && (
        <div className="space-y-3">
          {data?.today.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No booked patients.</p>}
          {data?.today.map((r) => <TodayCard key={r.id} r={r} onResult={notify} />)}
        </div>
      )}

      {tab === "done" && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {data?.done.length === 0 && <li className="p-6 text-center text-slate-500">Nothing completed yet.</li>}
          {data?.done.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><b>{d.code}</b> · {d.test_type_id} · from {d.from_name} · {fmtDT(d.accepted_slot_at)}</span>
              <span className="flex items-center gap-2">
                <StatusChip status={d.status} />
                <a href={`/api/reports/${d.id}`} target="_blank" className="text-teal-700 underline">Report</a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
