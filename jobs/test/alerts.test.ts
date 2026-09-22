import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../src/db.ts";
import { clearAlert, lastSuccessfulRun, shouldSendAlert } from "../src/load/alerts.ts";
import { localStack, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();
const KEY = "test-alert-key";

describe.skipIf(!stack)(`alert de-duplication (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    await db`delete from core.alert_state where key = ${KEY}`;
    await db`delete from core.sync_runs where job_name = 'test-dead-man'`;
  });

  afterAll(async () => {
    await db`delete from core.alert_state where key = ${KEY}`;
    await db`delete from core.sync_runs where job_name = 'test-dead-man'`;
    await db.end({ timeout: 5 });
  });

  it("alerts the first time, then stays quiet inside the cooldown", async () => {
    expect(await shouldSendAlert(db, KEY, 6)).toBe(true);
    // A condition that persists must not page on every 3-hourly run.
    expect(await shouldSendAlert(db, KEY, 6)).toBe(false);
    expect(await shouldSendAlert(db, KEY, 6)).toBe(false);
  });

  it("alerts again once the cooldown has elapsed", async () => {
    await db`
      update core.alert_state set last_sent_at = now() - interval '7 hours' where key = ${KEY}
    `;
    expect(await shouldSendAlert(db, KEY, 6)).toBe(true);
  });

  it("clearing the alert means the next failure pages immediately", async () => {
    expect(await shouldSendAlert(db, KEY, 6)).toBe(false);
    await clearAlert(db, KEY);
    // No waiting out a cooldown after a recovery.
    expect(await shouldSendAlert(db, KEY, 6)).toBe(true);
  });

  it("finds the last SUCCESSFUL run, ignoring failures and skips", async () => {
    expect(await lastSuccessfulRun(db, "test-dead-man")).toBeNull();

    await db`
      insert into core.sync_runs (job_name, status, started_at, finished_at)
      values
        ('test-dead-man', 'success', now() - interval '30 hours', now() - interval '30 hours'),
        ('test-dead-man', 'failed',  now() - interval '2 hours',  now() - interval '2 hours'),
        ('test-dead-man', 'skipped', now() - interval '1 hour',   now() - interval '1 hour')
    `;

    const last = await lastSuccessfulRun(db, "test-dead-man");
    expect(last).not.toBeNull();

    const ageHours = (Date.now() - last!.getTime()) / 3_600_000;
    // 30 hours old: past the 26 hour dead man's switch threshold.
    expect(ageHours).toBeGreaterThan(26);
  });

  it("a fresh success puts the switch back inside its threshold", async () => {
    await db`
      insert into core.sync_runs (job_name, status, started_at, finished_at)
      values ('test-dead-man', 'success', now(), now())
    `;
    const last = await lastSuccessfulRun(db, "test-dead-man");
    const ageHours = (Date.now() - last!.getTime()) / 3_600_000;
    expect(ageHours).toBeLessThan(26);
  });
});
