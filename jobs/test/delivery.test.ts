import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { newsAlertDelivery, type StatusChangeItem } from "@fpl/shared";
import { connect, type Db } from "../src/db.ts";
import { deliver } from "../src/deliver.ts";
import { countDeliveries } from "../src/load/deliveries.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import { postToMake } from "../src/make.ts";
import type { JobContext } from "../src/runner.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

/** A stand-in for Make's custom webhook: records bodies, answers `status`. */
async function fakeMake(status = 200): Promise<{ url: string; bodies: unknown[]; server: Server }> {
  const bodies: unknown[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(status).end(status === 200 ? "Accepted" : "Scenario failed");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hook`, bodies, server };
}

const item: StatusChangeItem = {
  fplId: 411, webName: "Haaland", team: "MCI", position: "FWD", ownership: 73.6,
  previousStatus: "a", status: "d", news: "Hamstring", chanceOfPlayingNextRound: 50,
  minutesRiskBand: "High", importance: 300,
};

describe("postToMake", () => {
  it("sends one POST with the secret in the body", async () => {
    const make = await fakeMake();
    const result = await postToMake({ url: make.url, secret: "s3cret-value" }, newsAlertDelivery([item], 1));
    make.server.close();

    expect(result).toEqual({ ok: true, status: 200, error: null });
    expect(make.bodies).toHaveLength(1);
    expect(make.bodies[0]).toMatchObject({ kind: "news_alert", secret: "s3cret-value" });
  });

  it("reports an HTTP error instead of throwing", async () => {
    const make = await fakeMake(500);
    const result = await postToMake({ url: make.url, secret: "x" }, newsAlertDelivery([item], 1));
    make.server.close();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it("reports an unreachable webhook instead of throwing", async () => {
    const result = await postToMake({ url: "http://127.0.0.1:1/hook", secret: "x" }, newsAlertDelivery([item], 1));
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
  });
});

const stack = localStack();
const ON = "2026-09-24";

describe.skipIf(!stack)(`deliver (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;
  let eventId: number;
  const saved = { ...process.env };

  function jobCtx(): JobContext {
    const ctx: JobContext = {
      cloud: false, dryRun: false, simulateFailure: false,
      db, syncRunId: null, results: [], warnings: [],
      record: (r) => ctx.results.push(r),
      warn: (m) => ctx.warnings.push(m),
    };
    return ctx;
  }

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    });
    await cleanup();
    const [player] = await db<{ id: string }[]>`select id from core.players limit 1`;
    const [row] = await db<{ id: string }[]>`
      insert into core.change_events (dedup_key, player_id, change_type, occurred_on, importance)
      values ('status_change:test-delivery', ${player!.id}, 'status_change', ${ON}::date, 300)
      returning id
    `;
    eventId = Number(row!.id);
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  async function cleanup() {
    await db`delete from core.deliveries where delivery_date = ${ON}::date`;
    await db`delete from core.change_events where occurred_on = ${ON}::date`;
    await db`delete from core.alert_state where key = 'make-delivery-failed'`;
  }

  afterAll(async () => {
    await cleanup();
    await db.end({ timeout: 5 });
  });

  const input = () => ({
    jobName: "test", date: ON, payload: newsAlertDelivery([item], 1), eventIds: [eventId], reportId: null,
  });

  it("skips with a warning when the webhook is not configured", async () => {
    delete process.env["MAKE_WEBHOOK_EVENTS_URL"];
    const ctx = jobCtx();
    expect(await deliver(ctx, input())).toBe(false);
    expect(ctx.warnings.join()).toMatch(/MAKE_WEBHOOK_EVENTS_URL/);
    expect(await countDeliveries(db, "news_alert", ON)).toBe(0);
  });

  it("writes nothing and sends nothing in a dry run", async () => {
    const make = await fakeMake();
    process.env["MAKE_WEBHOOK_EVENTS_URL"] = make.url;
    process.env["MAKE_WEBHOOK_SECRET"] = "x".repeat(16);
    const ctx = { ...jobCtx(), dryRun: true };
    expect(await deliver(ctx, input())).toBe(false);
    make.server.close();
    expect(make.bodies).toHaveLength(0);
  });

  it("records a failure, leaves the event undelivered, and does not throw", async () => {
    const make = await fakeMake(500);
    process.env["MAKE_WEBHOOK_EVENTS_URL"] = make.url;
    process.env["MAKE_WEBHOOK_SECRET"] = "x".repeat(16);
    delete process.env["TELEGRAM_BOT_TOKEN"]; // the alert path must not reach Telegram from a test
    const ctx = jobCtx();
    expect(await deliver(ctx, input())).toBe(false);
    make.server.close();

    const [event] = await db<{ notified_at: Date | null }[]>`select notified_at from core.change_events where id = ${eventId}`;
    expect(event?.notified_at).toBeNull();
    const [row] = await db<{ ok: boolean; http_status: number }[]>`
      select ok, http_status from core.deliveries where delivery_date = ${ON}::date
    `;
    expect(row).toEqual({ ok: false, http_status: 500 });
    expect(await countDeliveries(db, "news_alert", ON)).toBe(0);
  });

  it("marks events notified once Make accepts, and never re-stamps them", async () => {
    const make = await fakeMake();
    process.env["MAKE_WEBHOOK_EVENTS_URL"] = make.url;
    process.env["MAKE_WEBHOOK_SECRET"] = "x".repeat(16);

    expect(await deliver(jobCtx(), input())).toBe(true);
    const [first] = await db<{ notified_at: Date }[]>`select notified_at from core.change_events where id = ${eventId}`;
    expect(first?.notified_at).toBeInstanceOf(Date);

    expect(await deliver(jobCtx(), input())).toBe(true);
    make.server.close();
    const [second] = await db<{ notified_at: Date }[]>`select notified_at from core.change_events where id = ${eventId}`;
    expect(second?.notified_at.getTime()).toBe(first?.notified_at.getTime());
    expect(await countDeliveries(db, "news_alert", ON)).toBe(2);
  });
});
