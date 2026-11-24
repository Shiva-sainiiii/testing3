# TestBridge: NexHack 2.0 Tech Lead Plan (24h, team of 4)

## Context
Open Innovation track, 24h, judged by faculty and admin. Judges reward a working demo, robustness (recovery, no duplicates, explainable decisions, audit trail) and real-world impact. The team is strong in Next.js, realtime, PWAs, dashboards and maps. TestBridge moves only the diagnostic test from an overloaded government hospital to a partner lab with spare capacity. The report goes back to the original doctor, and the original queue slot goes to the next patient. The working directory is empty (only hello.txt), so this is a greenfield build.

**Assumptions**
- Hackathon runs H0 to H24, starting around 10:00 IST. Each team brings 3+ laptops and 2+ phones.
- Pre-event setup (accounts, installs, research) is allowed. **Code written before the event is not**, unless the rules say otherwise. Check this.
- One district, about 6 fictional hospitals (for example "Sarvodaya District Hospital", "Navjeevan CHC"). All patients are synthetic.
- The demo clock is real time, plus a "simulate +N hours" admin button for expiry and reminders.
- No real SMS is sent in the core demo. The simulated phone panel is the source of truth.

---

## As built: changes from this plan (read first)
The plan below is the original. The code differs in these places, on purpose:

| Plan said | As built | Why |
|---|---|---|
| Supabase client (`supabase.rpc`), Supabase Storage for PDFs | Built-in PGlite database (`./.data`, zero install) by default; any Postgres/Supabase via `DATABASE_URL`; report PDFs stored in the database | Runs on any laptop with just Node; same SQL on Supabase |
| Realtime first, 10 s polling fallback | 2 s polling always; Supabase Realtime optional, only triggers an instant refresh | Works with no realtime service at all |
| `/doctor/r/[id]`, `/doctor/r/[id]/slip`, `/lab/r/[id]` | `/r/[id]` and `/r/[id]/slip` shared by roles; lab work happens inline on `/lab` | Fewer screens to demo |
| Offline fallback = `supabase start` | `npm run start:lan` (built-in database) | No Docker or Supabase needed offline |
| Score stored per recipient | Score computed on read by `tb.score()` | “Waiting N days” stays current |
| Demo script: “13 days earlier” | Screen shows **14 days earlier** when the test is done the same day | Number is computed; say what the screen shows |

Extra, not in the plan: printable slip with QR, `npm run check:demo` rehearsal test, demo clock (`+1h/+6h/+24h`) driving expiry → radius widening → expiry SMS and day-before reminders.
How to run, deploy and demo: [README.md](README.md). Module status: [CLAUDE.md](CLAUDE.md).

---

## 1. Gaps and risks (direct)

**Realism (Indian government hospitals)**
1. **"Why would Lab B accept?" is your biggest hole.** Government labs are overloaded too. Your answer has to be specific: (a) uneven utilisation (some sub-district hospitals or CHCs and PPP diagnostic centres have machines with spare slots; **verify this with your local doctor**, don't assert it); (b) under PPP or free-diagnostics models, volume may be paid per test, so extra referrals can count as revenue or KPI; (c) the DHO dashboard makes utilisation visible. Get **one real quote** from a radiology or lab in-charge before the event.
2. **Hospital A's queue is usually a paper register.** "Slot released to next patient" only works if A's desk records its queue in TestBridge. Build a minimal **Home Queue** page for A's diagnostic desk, and say this honestly in the pitch.
3. **Test preparation and safety are missing.** MRI needs a metal or pacemaker check. Contrast CT needs a creatinine test and fasting. Ultrasound abdomen needs a full bladder or fasting. Each test type needs bilingual `prep` text and a "bring: OPD slip, ID, old reports" list in the SMS and on the slip. Judges with medical contacts will notice if it's missing.
4. **Patient consent is missing.** Under the DPDP Act 2023, sharing data with another facility needs consent. Add a required "Patient consented verbally (Hindi/English script read out)" checkbox to the request form, recorded in the audit log. Optionally, the patient replies YES by SMS.
5. **Phone numbers are unreliable.** Phones are often shared or belong to a relative, and some patients have none. The doctor **prints a referral slip** with a token, a QR code to the status page, the lab address and prep. The slip works without any phone. This matters more than the WhatsApp integration.
6. **Real SMS is hard in India.** Commercial SMS needs DLT template registration, and Twilio trial SMS to Indian numbers is unreliable. Use the **simulated phone panel** as primary. Twilio WhatsApp Sandbox is optional, and only if it works pre-event. Hindi SMS is Unicode, about 70 characters per segment, so keep messages short and put details behind the status link.
7. **Report trust.** Doctor A must trust B's report. Ship a PDF with the radiologist's name and registration number field. The reviewer names the reporting doctor. DICOM and PACS are next steps.
8. **Travel burden.** Elderly patients need an attendant and bus fare. Show distance and free/paid on every offer, and let the doctor set the max distance. Keep "Keep original date" one click away.
9. **First accept wins can give a worse slot** (Lab C might have offered an earlier date). That's fine for MVP and keeps the demo clear. Pitch "short offer window, pick earliest" as next step.

**Judge perspective**
10. Don't demo 12 screens. Demo **one flow** with three robustness moments: two labs race, a double click or refresh changes nothing, and the audit log explains every action.
11. Every number on screen (days saved, slots freed) must be **computed from data**, not hardcoded. Every real-world statistic in the pitch needs a source or a "[PLACEHOLDER: quote from Dr. X]".
12. Don't mention PM-JAY or NHM Free Diagnostics coverage specifics unless verified. Say "future integration" and nothing more.

**Technical**
13. All state changes go through **Postgres functions (RPC)**, never client-side multi-step writes. Atomicity and the audit log are written in the same transaction.
14. With no real auth, Supabase Realtime plus disabled RLS means any client can read everything. That's fine for synthetic data, but **say so** and pitch RLS by `hospital_id` as the production design.
15. Venue Wi-Fi is the most likely demo killer. See section 7.

**Stack verdict:** keep Next.js (App Router) + Tailwind + Supabase (Postgres, Realtime, Storage) + Vercel + Leaflet. Additions: plpgsql RPCs for transitions, a cookie holding the demo user id instead of Supabase Auth, a plain TS dictionary for Hindi/English (no i18n library), and the Noto Sans Devanagari font. Add nothing else.

---

## 2. Final MVP feature list (with acceptance tests)

**Must-have**
| # | Feature | Acceptance test |
|---|---|---|
| M1 | Seed + reset | `Reset demo` button restores 6 hospitals, 5 tests, A's queue of 5 patients in under 5s; IDs are stable |
| M2 | Demo login picker | Picking "Dr. Mehta, Hospital A" lands on doctor home; the role is shown in the header |
| M3 | Create referral | The form (patient phone/ABHA, test, P1–P3, temp-med flag, note, max km, consent) creates 1 referral; a double-click creates exactly 1 |
| M4 | Broadcast + live inbox | Within 2s of creation, labs within radius that offer the test show it; labs outside the radius don't |
| M5 | Safe accept | Two labs click Accept within 100ms: one wins, the other sees "Already accepted by Hospital B"; the audit log shows both attempts |
| M6 | Patient SMS (simulated) | On accept, the phone panel shows a Hindi + English message with lab, date, token, prep and status link |
| M7 | Public status page `/s/[token]` | Opens without login; Hindi/English toggle; shows the current step and updates live |
| M8 | Lab day list | Lab marks Arrived, then Test done; out-of-order clicks are rejected with a clear message |
| M9 | Report upload + return | Lab uploads a PDF; the doctor's referral shows "Report ready" live and the PDF opens; a second upload is rejected or versioned, never duplicated |
| M10 | Original slot release | On test_done, A's original slot goes to the next waitlisted patient, who gets an SMS; A's Home Queue updates live |
| M11 | Timeline + audit log | Each referral shows a timeline; the global audit page lists actor, role, action, from→to, time; rows can't be edited |
| M12 | Days-saved metric | Doctor sees "Report ready, N days earlier" = original_slot_date − test_done_date |
| M13 | Printable referral slip | Print view shows token, QR, lab, date, prep in Hindi + English |
| M14 | Score breakdown | Lab inbox ordering shows the breakdown (e.g. "P1 +100, temp meds +30, waited 3d +6, 12km −12 = 124") |

**Stretch (in this order, only after the H12 checkpoint passes)**
| # | Feature | Acceptance test |
|---|---|---|
| S1 | Demo clock + expiry/widen | "+6h" makes an unaccepted request widen from 15 to 30 km (new labs see it); after the 2nd expiry the doctor sees "Keep original date" |
| S2 | No-show + reminder | "+1 day" sends a reminder; the patient panel replies "1" → patient_confirmed; Lab marks No-show → referral back to open, the original slot is still held |
| S3 | DHO dashboard | KPIs (sent, accepted, avg days saved, slots freed, temp-med patients waiting >14d) match the DB counts |
| S4 | Map | Leaflet map on the new-referral and detail pages shows A, matching labs and radius circle |
| S5 | Offline PHC form | Form works in airplane mode, queues locally, submits once on reconnect (same idempotency key) |
| S6 | LLM note draft | Paste prescription text, get a draft note; the doctor must edit or confirm; labelled "AI draft" |

**Out of scope (pitch as next steps):** ABDM/ABHA linking, HMIS integration, DLT SMS, payments, transport, private hospitals, real auth with RLS, DICOM.

---

## 3. Data model (Postgres / Supabase)

```
hospitals(id pk, code 'A'..'F', name, district, type govt|ppp, lat, lng, address_en, address_hi, phone)
test_types(id pk, code 'MRI'..., name_en, name_hi, prep_en, prep_hi, bring_en, bring_hi)
hospital_tests(hospital_id fk, test_type_id fk, is_free bool, price_inr, current_wait_days,
               PRIMARY KEY(hospital_id, test_type_id))
demo_users(id pk, name, role doctor|lab|dho|admin, hospital_id fk null)
patients(id pk, display_name, phone, abha_id null, lang hi|en)          -- synthetic only

home_queue(id pk, hospital_id fk, test_type_id fk, patient_id fk, slot_at timestamptz null,
           status waiting|booked|held_backup|released|used, position int)
           -- A's own register; "next patient" = lowest position with status waiting

referrals(id pk, code 'TB-0042' unique, idem_key uuid unique,
          patient_id fk, from_hospital_id fk, doctor_id fk, test_type_id fk,
          priority p1|p2|p3, on_temp_medication bool, note text(280), consent_recorded bool not null,
          max_distance_km int, radius_round int default 1,
          original_queue_id fk home_queue, original_slot_at timestamptz,
          status referral_status, version int default 0,
          accepted_hospital_id fk null, accepted_slot_at null, accepted_by fk null, accepted_at null,
          patient_token text unique,          -- 22-char random, for /s/[token]
          expires_at, test_done_at null, created_at, updated_at)
  -- prevents duplicate active referrals for the same patient and test:
  CREATE UNIQUE INDEX one_active_referral ON referrals(patient_id, test_type_id)
    WHERE status NOT IN ('closed','expired','cancelled');

referral_recipients(referral_id fk, hospital_id fk, distance_km numeric, score int, score_breakdown jsonb,
                    notified_at, seen_at null, response null|accepted|lost_race|declined,
                    PRIMARY KEY(referral_id, hospital_id))
reports(id pk, referral_id fk UNIQUE, storage_path, reported_by_name, reg_no, uploaded_by fk, uploaded_at)
messages(id pk, referral_id fk null, patient_id fk, direction out|in, channel sms|whatsapp,
         lang, body, dedupe_key text UNIQUE, created_at)    -- dedupe_key e.g. 'accept:TB-0042'
audit_log(id bigserial pk, at timestamptz default now(), actor_id, actor_role, actor_hospital_id,
          referral_id null, action text, from_status, to_status, details jsonb, idem_key null)
  -- append-only: REVOKE UPDATE, DELETE; BEFORE UPDATE OR DELETE trigger raises exception
  -- "view" actions logged too: action='viewed_referral'
idempotency(key uuid pk, actor_id, action, result jsonb, created_at)
demo_clock(id int pk check(id=1), offset_interval interval default '0')   -- stretch S1
```

`referral_status` enum: `open, accepted, patient_confirmed, arrived, test_done, report_sent, closed, expired, cancelled, no_show`.

**Allowed transitions** (encoded once in a `transitions` table or a CASE in the RPC):
open→accepted|expired|cancelled; accepted→patient_confirmed|arrived|no_show|cancelled; patient_confirmed→arrived|no_show; arrived→test_done; test_done→report_sent; report_sent→closed; no_show→open (automatic); expired→open (widen, S1).

**Atomic accept: `accept_referral(p_ref, p_hospital, p_user, p_slot_at, p_idem uuid)`**, one transaction:
1. `INSERT INTO idempotency(key,...) VALUES (p_idem,...) ON CONFLICT DO NOTHING`. If nothing was inserted, `RETURN` the stored `result`. A retry or double click returns the same answer.
2. Compare-and-set:
   ```sql
   UPDATE referrals SET status='accepted', accepted_hospital_id=p_hospital, accepted_slot_at=p_slot_at,
          accepted_by=p_user, accepted_at=now(), version=version+1
   WHERE id=p_ref AND status='open' AND expires_at > now()
     AND EXISTS (SELECT 1 FROM referral_recipients WHERE referral_id=p_ref AND hospital_id=p_hospital)
   RETURNING * INTO r;
   ```
   Postgres row locking serialises concurrent UPDATEs. The second one re-checks `status='open'`, finds `accepted`, and updates 0 rows.
3. If found: mark the recipient `accepted` and the others' rows; set the original home_queue row to `held_backup`; insert the patient message with `dedupe_key 'accept:'||code` and `ON CONFLICT DO NOTHING`; write the audit row; store the result `{ok:true}`.
4. If not found: look up the current state and return `{ok:false, reason:'already_accepted', by:'Hospital B'}` (or `expired`). Mark this recipient `lost_race` and write an audit row `accept_rejected`. **Logging the losing attempt is a judge moment.**

**Generic `transition_referral(p_ref, p_from status[], p_to, p_actor, p_idem, p_details)`**: same pattern (idempotency, then `UPDATE … WHERE status = ANY(p_from)`, then audit and side effects). Side effects by target state:
- `test_done`: set test_done_at; original slot `released`; next `waiting` patient in A's home_queue gets the slot (status `booked`) and an SMS; audit `slot_released`.
- `no_show`: auto-transition to `open`, clear the accepted_* fields, reset recipients, reset expires_at; the original slot stays `held_backup`.
- `report_sent`: happens via `attach_report` (insert into reports, where the UNIQUE referral_id blocks duplicates), then transition.

Client idempotency: each form or button generates a `crypto.randomUUID()` when it renders and reuses it on retry. Buttons disable while a request is in flight. The DB is still the real guard.

`create_referral`: the RPC computes distance with haversine in SQL from hospital lat/lng, inserts recipients (labs offering the test within `max_distance_km`, excluding A), computes the score, and writes the audit row.
**Score** (shown everywhere): P1 +100 / P2 +50 / P3 +10; temp meds +30; +2 per day since created; −1 per km. Stored as `score_breakdown` jsonb so the UI just renders it.

---

## 4. API and realtime design

**Server actions** (Next.js `app/actions/*.ts`; each reads the demo-user cookie, calls `supabase.rpc(...)` with the service-role key, server only):
| Action | RPC | Role |
|---|---|---|
| `loginAs(userId)` | — (sets cookie) | any |
| `createReferral(form, idemKey)` | `create_referral` | doctor |
| `cancelReferral(id, idemKey)` | `transition_referral` | doctor |
| `acceptReferral(id, slotAt, idemKey)` | `accept_referral` | lab |
| `declineReferral(id, reason)` | updates recipient + audit | lab |
| `markArrived / markTestDone / markNoShow(id, idemKey)` | `transition_referral` | lab |
| `uploadReport(id, file, meta, idemKey)` | Storage upload to `reports/{code}.pdf` (upsert:false) + `attach_report` | lab |
| `logView(referralId)` | audit insert | all |
| `patientReply(token or phone, body)` | parses "1"/"YES" → `transition_referral(accepted→patient_confirmed)` | patient panel |
| `resetDemo()` / `advanceClock(hours)` | `reset_demo()` / `advance_clock()` (runs expiry and reminders) | admin |

**Route handlers:** `GET /s/[token]` (public status page, server rendered, read via a token-scoped RPC), `GET /api/reports/[id]` (signed URL after role check + view audit), `POST /api/inbound` (optional WhatsApp sandbox webhook that calls the same `patientReply`).

**Realtime** (Supabase `postgres_changes`; each subscription uses one `eq` filter):
| Subscriber | Table / filter | Event shown |
|---|---|---|
| Lab X inbox | `referral_recipients` `hospital_id=eq.X` (INSERT/UPDATE) | new request popup + sound; "already accepted by B" on update |
| Lab X inbox | `referrals` UPDATE (all; the client filters to ids it holds) | status changes on open cards |
| Doctor A | `referrals` `from_hospital_id=eq.A` | live status chips, "Accepted by B, tomorrow 10:00" |
| Doctor A | `reports` INSERT | "Report ready, N days earlier" toast |
| A's Home Queue | `home_queue` `hospital_id=eq.A` | slot held, then released, then reassigned |
| Phone panel | `messages` INSERT | new SMS bubble |
| Status page | `referrals` `patient_token=eq.T` | step progress |
| Audit page / DHO | `audit_log` INSERT | live log / KPI refresh |

**Fallback:** every list also refetches on window focus and every 10s while open. A dropped socket then degrades to polling instead of breaking.

---

## 5. Screens

**Shared:** `/`: login picker (cards per demo user plus Patient Phone and DHO), language toggle, "Synthetic demo data" banner on every page, admin drawer (Reset demo, +6h, +1 day).

**Doctor (Hospital A)**
- `/doctor`: My referrals table (code, patient masked `98xxxx3210`, test, priority chip, live status chip, lab, date, days saved), plus a "New referral" button.
- `/doctor/new`: patient phone/ABHA (lookup or create), test select (shows "Your queue: 14 days, original slot 8 Dec"), P1/P2/P3 segmented control with definitions, temp-med toggle, note (280 chars), max distance slider, consent checkbox with a script tooltip, live preview "3 partner labs within 25 km offer MRI (2 free)", submit.
- `/doctor/r/[id]`: timeline (vertical steps with time and actor), accepted lab card (name, distance, free/paid, slot), report viewer, "Print slip", "Cancel / keep original date", score breakdown, audit tab.
- `/doctor/r/[id]/slip`: print layout (token, QR, Hindi + English prep).
- `/doctor/queue`: Home Queue for A's desk (waitlist with positions; the held slot badge; the released slot animates to the next patient).

**Lab (B, C, D…)**
- `/lab`: Incoming tab (cards sorted by score: test, priority, temp-med badge, distance, free/paid at this lab, expiry countdown, score breakdown popover, date/time picker prefilled with the next slot, **Accept**, Decline). Patient identity is hidden until accepted. Plus a Today tab (accepted list with Arrived / Test done / No-show buttons and state-aware disabling) and Done tab.
- `/lab/r/[id]`: minimal patient data (view logged), prep info, report upload (PDF, reporting doctor name, reg no).

**Patient**
- `/phone`: simulated phone frame (select patient, SMS thread with Hindi + English bubbles, reply box with "1" quick reply).
- `/s/[token]`: big step indicator (Booked, Confirmed, Test done, Report sent to your doctor), lab name, address, Google Maps link, date and time, prep checklist, lab phone (tel: link), Hindi default, large type, no login.

**DHO (stretch S3):** `/dho`: KPI tiles (requests sent and accepted, acceptance rate, median days saved, slots freed, temp-med patients waiting >14d), per-hospital table (sent / accepted / P1 share per doctor for misuse), optional map.

**Admin:** `/audit`: filterable append-only log (live).

---

## 6. 24-hour schedule (4 people)

**Roles**
- **P1 Backend:** schema, RPCs, seed/reset, realtime setup, storage, deploy.
- **P2 Doctor UI:** doctor screens, slip, Home Queue, patient status page.
- **P3 Lab UI + DHO:** lab inbox/today/upload, audit page, DHO dashboard, map.
- **P4 Data/SMS/Pitch:** seed content, bilingual message templates and prep text, phone panel, test scripts, deck, demo script, QA lead.

| Hours | P1 Backend | P2 Doctor UI | P3 Lab UI | P4 Data/SMS/Pitch |
|---|---|---|---|---|
| H0–1 | **All together:** repo, Next.js scaffold, Supabase project, Vercel deploy of hello world, freeze status enum, table names and action signatures in `lib/types.ts` | | | |
| H1–4 | Tables, enum, audit trigger, seed + `reset_demo`, `create_referral` | Layout, login picker, cookie, new-referral form (mock data) | Lab inbox cards, accept picker (mock data) | Seed JSON (6 hospitals, lat/lng, tests, prep hi/en), message templates, phone panel UI |
| H4–8 | `accept_referral`, `transition_referral`, idempotency, realtime publication | Wire form to the action, My referrals with realtime | Wire inbox realtime + accept + "already accepted" | Message insert in RPCs (with P1), status page `/s/[token]` skeleton |
| **H8** | **Mini checkpoint:** create, both labs see it, race accept works on the deployed URL | | | |
| H8–12 | `attach_report`, storage bucket, slot release + next-patient SMS | Referral detail timeline, report viewer, days-saved | Today tab (arrived/done), upload report, audit page | Status page live, Hindi review, write race/double-click test checklist |
| **H12** | **HARD CHECKPOINT: the full demo flow (steps 1–6) runs end to end on Vercel across 3 devices, twice in a row after Reset.** If it fails, all 4 fix it; no stretch work until it passes. | | | |
| H12–14 | Robustness: retries, out-of-order clicks, refresh mid-flow, polling fallback | Slip print page + Home Queue | Score breakdown UI, empty/error states | Run the QA checklist, log bugs, draft deck |
| H14–20 | Sleep in pairs: P1+P3 sleep H14–17, P2+P4 sleep H17–20. Awake pair works on stretch in order: S1 expiry + demo clock (P1), S2 no-show (P1/P4), S3 DHO (P3), S4 map (P3/P2). | | | |
| **H20** | **Feature freeze.** Only bug fixes after this. | | | |
| H20–22 | Prod data reset, local fallback tested (see section 7) | UI polish, Hindi font check, mobile view of status page | Polish lab screens | Rehearse demo ×3 with timer, record backup video, finalise deck with real quotes |
| H22–24 | Buffer, final rehearsal, reset seed, charge devices, close all other tabs | | | |

---

## 7. Demo script (5:00)

**Devices**
- **Laptop 1 (projector), P2 drives:** Doctor A, then A's Home Queue.
- **Laptop 2, handed to a judge with P3 beside them:** Lab B (Sarvodaya District Hospital).
- **Laptop 3, P1 drives:** Lab C.
- **Phone or tablet, P4 holds it up and mirrors it to the projector if possible:** `/phone` panel, then `/s/[token]`.
- **Speaker:** P4 narrates. Before going on: Reset demo, all screens logged in.

**0:00–0:40, Problem (P4):**
"Ramesh-ji, 58, has severe back pain. His doctor at a government hospital orders an MRI. The hospital's MRI queue is 14 days [PLACEHOLDER: real quote — 'At our hospital MRI waiting is __ days' — Dr. ___, ___ Hospital]. For those 14 days he's on painkillers and his treatment is paused. A hospital 12 km away has free MRI slots this week, but there's no way to use them. TestBridge fixes that. *Your doctor stays the same. Only the test moves.*"

**0:40–1:30, Create (P2 on Laptop 1):**
"I'm Dr. Mehta at Hospital A. Patient's mobile, test MRI, our queue says original slot 8 December. Priority P2, and he's on temporary medication, which we flag. The patient consented; we tick that and it's logged. The system already shows 3 partner labs within 25 km, 2 of them free. Send."

**1:30–2:30, The race (judge on Laptop 2, P1 on Laptop 3):**
"Both labs got it instantly. Notice the lab sees no name, only the test, priority and *why* it's ranked where it is: here's the score breakdown." Point to it. "Sir/Ma'am, you're Lab B. Pick tomorrow 10 AM and press Accept." (P1 presses Accept on Lab C at the same moment.) "Lab C tried at the same moment and got 'Already accepted by Hospital B'. Exactly one booking, guaranteed by the database, not by luck. Let me double-click Accept again… nothing changes."

**2:30–3:10, Patient (P4 holds phone):**
"Ramesh-ji has no smartphone app. He gets one SMS in Hindi and English: where, when, token, and to remove metal items before the MRI. He can also take a printed slip from the doctor." Show the slip briefly on Laptop 1. "Reply 1 to confirm." Tap 1. The status page shows Confirmed.

**3:10–4:00, Test and report (judge or P3 on Laptop 2):**
"At Lab B: patient arrived, MRI done, upload report." Upload. Switch to Laptop 1: toast **"Report ready: 14 days earlier."** "And here's the part nobody else does: Hospital A's original 8 December slot was kept as a backup until the test was actually done. Now it's released." Open Home Queue: the slot moves to the next patient, who gets an SMS. "**One referral shortened the whole queue.**"

**4:00–4:40, Trust (P2):**
Open the audit log. "Every action: who, which role, when, from which state to which, including Lab C's failed attempt and every time someone viewed patient data. Priority is set by the doctor and visible to everyone, so queue-jumping is auditable." (If S3 is done: 10s on the DHO dashboard.)

**4:40–5:00, Close (P4):**
"Ramesh-ji saved 14 days on painkillers. Hospital A's queue got shorter. No new machines, no app for the patient, no integration with hospital systems on day one. Next: ABHA linking and a pilot in one district. TestBridge: only the test moves."

**If venue Wi-Fi fails**
1. **Primary backup:** two phone hotspots on different carriers (Jio + Airtel), pre-paired on all devices. Vercel + Supabase work over 4G.
2. **No internet at all:** P1's laptop runs `supabase start` (Docker, pre-pulled images) + `next start` with `.env.local` pointing to local Supabase. The other devices join a hotspot LAN (a phone hotspot works without data) and open `http://<P1-ip>:3000`. Rehearse this at H20.
3. **Last resort:** a 2:30 screen-recorded run (recorded at H21) plus screenshots in the deck. Narrate live over the video.

---

## 8. Likely judge questions (short, honest answers)

- **Privacy?** "Labs see only the test, priority, a 280-character note and distance until they accept; then mobile or ABHA and name. Consent is recorded, every view is logged, the audit table is append-only, and the demo uses only synthetic data. In production: RLS by hospital, consent aligned with the DPDP Act 2023 and ABDM consent flows."
- **Why would a lab accept?** "Honestly, this needs validation. Our hypothesis is uneven utilisation across facilities [PLACEHOLDER: what the lab in-charge told us]. The DHO dashboard makes idle capacity and referrals visible, and for PPP or per-test models it's added volume. We'd pilot with labs that already have spare slots."
- **Doesn't the government already do this?** "eSanjeevani is teleconsultation and ABDM is records and IDs. We didn't find a system for cross-facility diagnostic slot sharing at district level, but we'd integrate rather than compete: ABHA as the patient ID and NHM free diagnostics as the network. [Verify before saying 'didn't find'.]"
- **Adoption, staff are busy?** "Two clicks for the doctor, one accept for the lab, no integration, works on any browser. The printed slip means patients without phones are covered."
- **Misuse or queue-jumping?** "The doctor sets priority, the score breakdown is visible to every lab, and the DHO sees P1 share per doctor. Every action is audited."
- **What if the patient doesn't go?** "Reminder plus reply 1. A no-show puts the request back to open, and the original slot was never released, so the patient loses nothing."
- **Scale?** "Postgres with row-level atomic updates is fine at district scale (hundreds of referrals per day). State-level would mean partitioning by district; the logic doesn't change."
- **Report quality and liability?** "The report carries the reporting doctor's name and registration number. The treating doctor stays responsible for care; we only move the test."
- **Cost to the patient?** "Free or paid is shown before booking and the doctor can restrict to free labs. Travel is a real cost, which is why max distance is set per request."
- **Real SMS?** "Simulated today, because commercial SMS in India needs DLT template registration. In production: DLT-registered templates or the WhatsApp Business API."

---

## 9. Pre-event checklist

**Rules first:** confirm with the organisers whether pre-written code, boilerplate or templates are allowed. If not, only do the setup below (no app code).
- [ ] Accounts for all 4: GitHub org/repo (empty), Vercel team, Supabase project (check free-tier limits), optional Twilio WhatsApp Sandbox tested with one teammate's phone.
- [ ] Installs: Node LTS, pnpm, Supabase CLI, Docker with Supabase images pulled (`supabase start` once), VS Code; Noto Sans Devanagari available.
- [ ] Each person builds a throwaway toy using their part (Supabase realtime subscription, `rpc` call, Storage upload, Leaflet map) so nobody learns on the day.
- [ ] **Field research:** talk to 1–2 doctors or lab in-charges for real wait times by test, how queues are recorded (register or HMIS), whether spare capacity exists, prep requirements. Get permission to quote and note name, role and date. Fill the placeholders.
- [ ] Verify any claims you plan to make about NHM Free Diagnostics, PM-JAY, ABDM/ABHA from official sites; otherwise say "future integration" only.
- [ ] Write the fictional hospital list (names, invented addresses in one district, realistic lat/lng spread over about 40 km), 5 test types with bilingual prep text, reviewed by a native Hindi speaker.
- [ ] Draft the message templates (Hindi + English, under 70 Unicode characters for the core line).
- [ ] Deck skeleton (problem, flow, demo, trust/robustness, impact, next steps, team), no invented statistics.
- [ ] Hardware: 3 laptops + chargers, 2 phones on different carriers with data packs, extension board, HDMI adapter, a phone stand for the patient phone.
- [ ] Agree on the schema, status enum and the action list in this document before H0, so H0–1 is just typing it in.

---

## Verification (during the build)
- Race test: two browsers, script `Promise.all([accept(B), accept(C)])` from a dev page. Exactly one `accepted` and one `accept_rejected` in the audit log.
- Idempotency: call `acceptReferral` twice with the same key. Same result, one message row, one audit `accepted`.
- Out-of-order: `markTestDone` on an `accepted` referral is rejected with a message.
- Duplicate report: a second upload is rejected (UNIQUE referral_id).
- Reset demo, then run the full script twice in a row on the deployed URL (H12 and H20 gates).
- Offline drill: run the local Supabase fallback on a hotspot LAN at H20.
