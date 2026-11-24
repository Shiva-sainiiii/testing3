"use client";

import { useState, useTransition } from "react";
import { advanceClock, resetDemo } from "@/app/actions";

// DEMO ONLY: reset seed data and move the demo clock (to show expiry, reminders).
export function DemoControls({ offsetH }: { offsetH: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; [k: string]: unknown }>, label: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? `${label} ✓` : r.message ?? "failed");
      setTimeout(() => setMsg(""), 3000);
    });
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
        Demo ⚙{offsetH ? ` · clock +${offsetH}h` : ""}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
        <button
          disabled={pending}
          onClick={() => confirm("Reset ALL demo data?") && run(resetDemo, "Reset")}
          className="w-full rounded-md bg-rose-600 px-2 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          Reset demo data
        </button>
        <div className="flex gap-1">
          {[1, 6, 24].map((h) => (
            <button key={h} disabled={pending} onClick={() => run(() => advanceClock(h), `+${h}h`)}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50">
              +{h}h
            </button>
          ))}
        </div>
        <p className="text-slate-500">Clock offset: +{offsetH}h. Advancing runs expiry, radius widening and reminders.</p>
        {msg && <p className="font-semibold text-teal-700">{msg}</p>}
      </div>
    </details>
  );
}
