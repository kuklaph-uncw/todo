/**
 * Fills a demo vault with ~10 weeks of realistic work so the UI can be tried
 * out. Writes to VAULT_PATH (default ./demo-vault) and refuses to touch a
 * folder that already has files in it.
 *
 *   bun run seed:demo
 *   VAULT_PATH=demo-vault bun run dev
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { addDays, localDateString, parseLocalDate } from "../src/lib/date";
import { Vault } from "../src/vault/vault";

const root = resolve(process.env.VAULT_PATH ?? "demo-vault");
if (existsSync(root) && readdirSync(root).length > 0) {
  console.error(`${root} is not empty. Point VAULT_PATH at an empty folder.`);
  process.exit(1);
}

const vault = new Vault(root);
const today = localDateString();
const year = today.slice(0, 4);

const reliability = vault.createGoal({
  title: "Improve platform reliability",
  cycle: year,
  body: "Cut pages per week in half and get every service an owner and a runbook.\n\nMeasured by: on-call page count, incident count, runbook coverage.",
}).slug;
const mentoring = vault.createGoal({
  title: "Grow the team through mentoring",
  cycle: year,
  body: "Pair weekly with the two newest engineers and help one of them lead a project end to end.",
}).slug;
const delivery = vault.createGoal({
  title: "Ship the billing migration",
  cycle: year,
  body: "Move all invoicing to the new billing service with zero customer-facing incidents.",
}).slug;

const POOL: { text: string; tags: string[]; goals: string[]; minutes: number | null; star?: boolean }[] = [
  { text: "Reviewed the billing migration design doc and flagged two rollback gaps", tags: ["review"], goals: [delivery], minutes: 60, star: true },
  { text: "Paired with Priya on her first on-call handoff", tags: ["mentoring"], goals: [mentoring], minutes: 45 },
  { text: "Fixed the flaky auth integration test that failed 1 in 20 runs", tags: ["bug", "testing"], goals: [reliability], minutes: 90, star: true },
  { text: "Wrote the runbook for the export service", tags: ["docs"], goals: [reliability], minutes: 75 },
  { text: "Helped support untangle a double-charge escalation", tags: ["support"], goals: [], minutes: 40 },
  { text: "Cut alert noise on the queue workers from 14 pages a week to 3", tags: ["ops"], goals: [reliability], minutes: 120, star: true },
  { text: "Ran the incident review for the Tuesday outage and published follow-ups", tags: ["incident"], goals: [reliability], minutes: 60 },
  { text: "1:1 with Sam on career goals; agreed he leads the webhook retry project", tags: ["mentoring"], goals: [mentoring], minutes: 30 },
  { text: "Migrated invoice rendering to the new billing service behind a flag", tags: ["billing"], goals: [delivery], minutes: 180 },
  { text: "Reviewed four PRs for the webhook retry work", tags: ["review"], goals: [mentoring], minutes: 50 },
  { text: "Answered onboarding questions in the #eng-help channel", tags: ["support"], goals: [], minutes: 20 },
  { text: "Planned Q4 roadmap priorities with product", tags: ["planning"], goals: [], minutes: 60 },
  { text: "Backfilled 2 years of invoices into the new billing tables", tags: ["billing", "data"], goals: [delivery], minutes: 150, star: true },
  { text: "Tuned the Postgres connection pool; p99 dropped from 900ms to 310ms", tags: ["performance"], goals: [reliability], minutes: 100, star: true },
  { text: "Gave a lunch-and-learn on reading flame graphs", tags: ["mentoring", "talk"], goals: [mentoring], minutes: 60 },
];

let n = 0;
for (let offset = 70; offset >= 1; offset--) {
  const date = addDays(today, -offset);
  const dow = parseLocalDate(date).getDay();
  if (dow === 0 || dow === 6) continue;
  if (offset % 9 === 4) continue; // a few missed days, like real life
  const count = 1 + (offset % 3);
  for (let i = 0; i < count; i++) {
    const pick = POOL[n++ % POOL.length];
    vault.addEntries(date, [pick.text], {
      tags: pick.tags,
      goals: pick.goals,
      minutes: pick.minutes,
      isHighlight: Boolean(pick.star) && n % 2 === 0,
      time: null,
    });
  }
}

vault.addEntries(today, ["Walked the team through the billing cutover checklist"], {
  tags: ["billing"], goals: [delivery], minutes: 45, isHighlight: true, time: "09:40",
});
vault.addEntries(today, ["Unblocked Priya on the retry backoff math"], {
  tags: ["mentoring"], goals: [mentoring], minutes: 20, isHighlight: false, time: "11:15",
});
vault.addEntries(today, [`Billing cutover retro
Went smoother than planned. Two things worth keeping:

- **Dry run the day before** caught the missing index
- Paging on-call early meant no surprises
  - they had the dashboards open before we started

Next: turn the checklist into a runbook #ops`], {
  tags: [], goals: [], minutes: null, isHighlight: false, time: null,
});

const todo = (task: string, priority: "High" | "Medium" | "Low" | null, goals: string[] = []) =>
  vault.addTodo({ task, priority, status: "Open", tags: [], goals, notes: "" }, addDays(today, -20));

const done1 = todo("Write the billing cutover checklist #billing", "High", [delivery]);
vault.updateTodo(done1.id, { status: "Done", isHighlight: true }, addDays(today, -3));
const done2 = todo("Add owners to every service in the catalog #ops", "Medium", [reliability]);
vault.updateTodo(done2.id, { status: "Done" }, addDays(today, -12));
const done3 = todo("Draft self-review notes for mid-year check-in", "Medium");
vault.updateTodo(done3.id, { status: "Done" }, addDays(today, -30));

const notesTodo = todo("Investigate memory growth in the export worker #bug", "High", [reliability]);
vault.updateTodo(notesTodo.id, { notes: "Heap snapshots from staging are in the incident channel." }, today);
todo("Prep Sam for the webhook retry design review #mentoring", "Medium", [mentoring]);
todo("Review Priya's runbook PR #review", "Low", [mentoring]);
todo("Schedule the billing dry run with finance #billing", "Medium", [delivery]);
todo("Update the on-call rotation doc", null);
const waiting = todo("Turn off the legacy invoice cron #billing", "High", [delivery]);
vault.updateTodo(waiting.id, { notes: "Waiting on finance sign-off." }, today);

console.log(`Demo vault written to ${root}`);
