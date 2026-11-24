"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createReferral, lookupPatientAction, previewLabsAction } from "@/app/actions";
import { useIdemKey } from "@/lib/useLive";
import { PRIORITY, fmtDT } from "@/lib/format";
import { Alert, Card, btnPrimary, btnSecondary, input } from "@/components/ui";

type Test = { id: string; name_en: string; current_wait_days: number | null };
type Lookup = Awaited<ReturnType<typeof lookupPatientAction>>;
type Lab = { id: string; short_name: string; kind: string; is_free: boolean; price_inr: number | null; current_wait_days: number; distance_km: number };

const DEMO_PATIENT = { phone: "9876500001", note: "Low back pain radiating to left leg for 3 weeks. Suspected disc prolapse. On analgesics." };
const CONSENT_SCRIPT =
  "I explained to the patient (in Hindi/English) that their mobile number, test name and a short note will be shared with a partner lab to get an earlier slot, and they agreed.";

export function NewReferralForm({ tests }: { tests: Test[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [abha, setAbha] = useState("");
  const [test, setTest] = useState(tests[0]?.id ?? "MRI");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3">("P2");
  const [tempMed, setTempMed] = useState(false);
  const [note, setNote] = useState("");
  const [maxKm, setMaxKm] = useState(25);
  const [consent, setConsent] = useState(false);
  const [waitDays, setWaitDays] = useState<number | "">("");
  const [lookup, setLookup] = useState<Lookup>(null);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [error, setError] = useState<{ msg: string; code?: string } | null>(null);
  const [pending, start] = useTransition();
  const [idem, rotateIdem] = useIdemKey();

  const digits = phone.replace(/\D/g, "").slice(-10);
  const testInfo = tests.find((t) => t.id === test);

  useEffect(() => {
    let live = true;
    (digits.length === 10 ? lookupPatientAction(digits, test) : Promise.resolve(null)).then((r) => live && setLookup(r));
    return () => { live = false; };
  }, [digits, test]);

  useEffect(() => {
    let live = true;
    previewLabsAction(test, maxKm).then((r) => live && setLabs(r as Lab[]));
    return () => { live = false; };
  }, [test, maxKm]);

  const isNew = digits.length === 10 && lookup && !lookup.patient;
  const needsWait = digits.length === 10 && lookup && !lookup.slot;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = await createReferral(
          {
            phone: digits, name, abha, test, priority, temp_med: tempMed, note, max_km: maxKm, consent,
            wait_days: needsWait ? Number(waitDays || testInfo?.current_wait_days || 0) : null,
          },
          idem,
        );
        rotateIdem(); // definitive answer: a corrected resubmit must use a fresh key
        if (res.ok) router.push(`/r/${res.id}`);
        else setError({ msg: res.message ?? "Could not create referral", code: res.code as string | undefined });
      } catch {
        setError({ msg: "Network problem. Press Send again; it will not create a duplicate." }); // same key kept
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">1. Patient</h2>
          <button type="button" className="text-xs text-teal-700 underline"
            onClick={() => { setPhone(DEMO_PATIENT.phone); setNote(DEMO_PATIENT.note); setTempMed(true); setTest("MRI"); }}>
            Use demo patient (Ramesh Kumar)
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Mobile number (or relative&apos;s)
            <input className={input} inputMode="numeric" placeholder="10-digit mobile" value={phone}
              onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label className="text-sm">ABHA ID (optional)
            <input className={input} placeholder="future ABDM integration" value={abha} onChange={(e) => setAbha(e.target.value)} />
          </label>
        </div>
        {lookup?.patient && (
          <Alert kind="info">
            <b>{lookup.patient.display_name}</b>{lookup.patient.age ? `, ${lookup.patient.age}` : ""}
            {lookup.slot
              ? <> · Original slot in your queue: <b>{fmtDT(lookup.slot.slot_at)}</b> (position {lookup.slot.position}). It stays as a backup until the test is done.</>
              : <> · No slot in your {test} queue.</>}
          </Alert>
        )}
        {lookup?.active && (
          <Alert kind="warn">
            Already has an active referral for this test: <Link className="underline" href={`/r/${lookup.active.id}`}>{lookup.active.code}</Link>
          </Alert>
        )}
        {isNew && (
          <label className="block text-sm">New patient: name
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. Test and urgency</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Test
            <select className={input} value={test} onChange={(e) => setTest(e.target.value)}>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_en}{t.current_wait_days != null ? ` (your queue: ${t.current_wait_days} days)` : ""}
                </option>
              ))}
            </select>
          </label>
          {needsWait && (
            <label className="text-sm">Current wait at your hospital (days)
              <input className={input} type="number" min={1} max={120} placeholder={String(testInfo?.current_wait_days ?? "")}
                value={waitDays} onChange={(e) => setWaitDays(e.target.value ? Number(e.target.value) : "")} />
            </label>
          )}
        </div>
        <div>
          <div className="mb-1 text-sm">Priority (set by doctor, visible to every lab, audited)</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["P1", "P2", "P3"] as const).map((p) => (
              <button type="button" key={p} onClick={() => setPriority(p)}
                className={`rounded-lg border p-2 text-left text-sm ${priority === p ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600/30" : "border-slate-300 bg-white"}`}>
                <div className="font-semibold">{PRIORITY[p].label}</div>
                <div className="text-xs text-slate-500">{PRIORITY[p].desc}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tempMed} onChange={(e) => setTempMed(e.target.checked)} />
          Patient is on <b>temporary medication</b> (e.g. painkillers) while waiting for this test
        </label>
        <label className="block text-sm">Short clinical note for the lab ({280 - note.length} left)
          <textarea className={input} rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Region / indication. No more than the lab needs." />
        </label>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">3. Where to look</h2>
        <label className="block text-sm">Maximum travel distance: <b>{maxKm} km</b>
          <input type="range" min={5} max={60} step={5} value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} className="w-full accent-teal-700" />
        </label>
        <div className="text-sm">
          <b>{labs.length}</b> partner lab{labs.length === 1 ? "" : "s"} within {maxKm} km offer this test
          {labs.length > 0 && <> ({labs.filter((l) => l.is_free).length} free)</>}:
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {labs.map((l) => (
              <li key={l.id} className="flex justify-between px-3 py-1.5">
                <span>{l.short_name}</span>
                <span className="text-slate-500">
                  {l.distance_km} km · {l.is_free ? "Free (govt)" : `₹${l.price_inr} (PPP)`} · ~{l.current_wait_days}d wait
                </span>
              </li>
            ))}
            {labs.length === 0 && <li className="px-3 py-2 text-slate-500">None: widen the distance.</li>}
          </ul>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">4. Consent</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{CONSENT_SCRIPT} <span className="text-slate-500">(recorded in the audit log)</span></span>
        </label>
      </Card>

      {error && (
        <Alert kind="error">
          {error.msg}
          {error.code && lookup?.active && <> · <Link className="underline" href={`/r/${lookup.active.id}`}>Open {error.code}</Link></>}
        </Alert>
      )}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={pending || !consent || labs.length === 0}>
          {pending ? "Sending…" : `Send to ${labs.length} lab${labs.length === 1 ? "" : "s"}`}
        </button>
        <Link href="/doctor" className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  );
}
