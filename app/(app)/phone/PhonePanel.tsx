"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { patientReply } from "@/app/actions";
import { useIdemKey, useLive } from "@/lib/useLive";
import { fmtT, maskPhone } from "@/lib/format";
import { LiveBadge } from "@/components/LiveBadge";

type Msg = { id: number; direction: "in" | "out"; body_hi: string | null; body_en: string; created_at: string };
type Patient = { id: string; display_name: string; phone: string; n: number };
type Data = { patients: Patient[]; selected: string; messages: Msg[] };

/** Turns "/s/<token>" inside an SMS into a clickable link to the status page. */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(\/s\/[a-f0-9]{32})/);
  return (
    <>
      {parts.map((p, i) =>
        /^\/s\/[a-f0-9]{32}$/.test(p) ? (
          <a key={i} href={p} target="_blank" className="break-all font-semibold text-sky-700 underline">tb.link{p.slice(0, 11)}…</a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function PhonePanel() {
  const [chosen, setChosen] = useState<string | null>(null); // null = follow the latest message
  const { data, stale, refresh } = useLive<Data>(`/api/live?view=phone${chosen ? `&patient=${chosen}` : ""}`);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [idem, rotateIdem] = useIdemKey();
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count, data?.selected]);

  const patient = data?.patients.find((p) => p.id === data.selected);
  const withMsgs = data?.patients.filter((p) => p.n > 0) ?? [];

  const send = (body: string) =>
    start(async () => {
      if (!data) return;
      await patientReply(data.selected, body, idem);
      rotateIdem();
      setText("");
      refresh();
    });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Patient phone</h1>
          <LiveBadge stale={stale} />
        </div>
        <p className="text-sm text-slate-600">
          Simulated SMS. Patients need no app or smartphone: one SMS in Hindi + English, a reply “1” to confirm, and a status link.
          Real deployment: DLT-registered SMS templates or WhatsApp Business.
        </p>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Phones with messages</div>
          <div className="flex flex-wrap gap-2">
            {withMsgs.length === 0 && <span className="text-sm text-slate-500">No messages yet.</span>}
            {withMsgs.map((p) => (
              <button key={p.id} onClick={() => setChosen(p.id)}
                className={`rounded-full border px-3 py-1 text-sm ${data?.selected === p.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white"}`}>
                {p.display_name} <span className="opacity-70">({p.n})</span>
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">Or any patient
          <select className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={chosen ?? ""} onChange={(e) => setChosen(e.target.value || null)}>
            <option value="">Follow latest message</option>
            {data?.patients.map((p) => <option key={p.id} value={p.id}>{p.display_name} · {maskPhone(p.phone)}</option>)}
          </select>
        </label>
      </div>

      {/* phone frame */}
      <div className="mx-auto w-[360px] rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
        <div className="flex h-[640px] flex-col overflow-hidden rounded-[1.8rem] bg-[#ece5dd]">
          <div className="bg-teal-800 px-4 py-3 text-white">
            <div className="text-xs opacity-80">SMS · TestBridge (TB-ALERT)</div>
            <div className="font-semibold">{patient?.display_name ?? "…"} <span className="text-xs font-normal opacity-80">{patient?.phone}</span></div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {data?.messages.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">No messages for this patient.</p>}
            {data?.messages.map((m) =>
              m.direction === "out" ? (
                <div key={m.id} className="mr-8 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-snug shadow-sm">
                  {m.body_hi && <p className="mb-1.5"><Linkify text={m.body_hi} /></p>}
                  <p className={m.body_hi ? "border-t border-slate-100 pt-1.5 text-slate-700" : ""}><Linkify text={m.body_en} /></p>
                  <div className="mt-1 text-right text-[10px] text-slate-400">{fmtT(m.created_at)}</div>
                </div>
              ) : (
                <div key={m.id} className="ml-auto w-fit max-w-[70%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm shadow-sm">
                  {m.body_en}
                  <div className="mt-1 text-right text-[10px] text-slate-400">{fmtT(m.created_at)}</div>
                </div>
              ),
            )}
            <div ref={bottom} />
          </div>
          <form className="flex gap-2 border-t border-slate-300 bg-white p-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text); }}>
            <button type="button" disabled={pending || !data} onClick={() => send("1")}
              className="rounded-full bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50" title="Reply 1 to confirm">
              1
            </button>
            <input className="flex-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm" placeholder="Reply…" value={text} onChange={(e) => setText(e.target.value)} />
            <button disabled={pending || !text.trim()} className="rounded-full bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
