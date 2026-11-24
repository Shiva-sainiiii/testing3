// Rehearsal check: follows the PLAN.md section 7 demo script (demo script) across 5 "devices", starting from the Reset button.
import { chromium } from "playwright-core";
const B = process.env.BASE ?? "http://localhost:3000";
// Uses only the app's HTTP API, so it works with the local database and with Postgres.
const api = async (u) => (await (await fetch(`${B}${u}`)).json()).data;
const smsCount = async () => (await api("/api/live?view=phone&patient=P-RAMESH")).messages.length;
const errors = [];
const t0 = Date.now();
const step = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
async function device(name, login) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  p.on("dialog", (d) => d.accept());
  await p.goto(B);
  if (login) { await p.getByText(login, { exact: true }).click(); await p.waitForURL(/\/(lab|doctor|dho)$/); }
  return p;
}

// Before going on: Reset demo via the UI button
const laptop1 = await device("doctor", "Dr. A. Mehta");
await laptop1.getByText(/^Demo ⚙/).click();
await laptop1.getByRole("button", { name: "Reset demo data" }).click();
await laptop1.getByText("Reset ✓").waitFor();
await laptop1.reload();
const laptop2 = await device("labB", "Lab desk, Sarvodaya SDH");
const laptop3 = await device("labC", "Lab desk, Navjeevan CHC");
const phone = await device("phone", null);
await phone.goto(`${B}/phone`);
step("Reset via UI; 4 devices logged in");

// 0:40 Create
await laptop1.goto(`${B}/doctor/new`);
await laptop1.getByText("Use demo patient").click();
await laptop1.getByText(/Original slot in your queue/).waitFor();
await laptop1.getByText(/I explained to the patient/).click();
const btn = laptop1.getByRole("button", { name: /Send to 3 labs/ });
await btn.waitFor();
await btn.click();
await laptop1.waitForURL("**/r/*");
step("Doctor sent referral to 3 labs");

// 1:30 Race
await Promise.all([laptop2.getByText("MRI scan").first().waitFor(), laptop3.getByText("MRI scan").first().waitFor()]);
step("Request visible on Lab B and Lab C");
const [aB, aC] = [laptop2.getByRole("button", { name: "Accept" }), laptop3.getByRole("button", { name: "Accept" })];
await Promise.all([aB.dispatchEvent("click"), aC.dispatchEvent("click")]);
const winnerName = await Promise.race([
  laptop2.getByText(/Accepted TB-1001/).waitFor().then(() => "B"),
  laptop3.getByText(/Accepted TB-1001/).waitFor().then(() => "C"),
]);
const [win, lose] = winnerName === "B" ? [laptop2, laptop3] : [laptop3, laptop2];
await lose.getByText(/Already accepted by/).first().waitFor();
step(`Race: Lab ${winnerName} won, other lab sees "Already accepted by …"`);
// double-click Accept again → nothing changes (card is gone; try via API with same flow)
const before = await smsCount();
await win.reload();
await win.waitForTimeout(1500);
const after = await smsCount();
step(`After refresh: patient SMS count unchanged? ${before} → ${after}`);
if (before !== after) errors.push("duplicate SMS after refresh");

// 2:30 Patient
await phone.getByText(/पर तय है/).waitFor();
step("Patient phone got Hindi+English booking SMS");
await laptop1.goto(`${B}/r/1/slip`);
await laptop1.locator("img[alt^='QR']").waitFor();
step("Slip with QR shown");
await phone.getByTitle("Reply 1 to confirm").click();
await phone.getByText(/is confirmed/).first().waitFor();
step("Patient replied 1 → confirmed");

// 3:10 Test and report
await win.getByRole("button", { name: /Booked \/ today/ }).click();
await win.getByRole("button", { name: "Arrived" }).click();
await win.getByText(/patient arrived/).waitFor();
await win.getByRole("button", { name: "Test done" }).click();
await win.getByText(/original slot released/).waitFor();
await win.getByRole("button", { name: "Use sample report" }).click();
await win.getByText("TB-1001-report.pdf").waitFor();
await win.getByRole("button", { name: "Upload & send" }).click();
await win.getByText(/report sent to the referring doctor/).waitFor();
step("Lab: arrived → test done → report uploaded");
await laptop1.goto(`${B}/r/1`);
const banner = await laptop1.getByText(/Report ready: \d+ days earlier/).innerText();
step(`Doctor sees "${banner}"`);
await laptop1.goto(`${B}/doctor/queue`);
await laptop1.getByText(/got an earlier slot/).first().waitFor();
step("Home queue: slot released to Pooja Rani");

// 4:00 Trust
await laptop1.goto(`${B}/audit`);
await laptop1.getByText("Accept rejected (already taken)").waitFor();
step(`Audit log shows the losing attempt; ${(await api("/api/live?view=audit")).length} rows`);
console.log(errors.length ? `ERRORS: ${errors.join(" | ")}` : `PASS in ${((Date.now() - t0) / 1000).toFixed(0)}s, no errors`);
await browser.close();
process.exit(errors.length ? 1 : 0);
