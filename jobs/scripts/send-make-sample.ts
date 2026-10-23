/**
 * Sends ONE sample payload to MAKE_WEBHOOK_EVENTS_URL.
 *
 * Use it twice while building Scenario 1 (docs/make.md): first so Make's
 * custom webhook can learn the data structure, then to test the finished
 * scenario end to end. It goes to whatever the scenario is wired to — once
 * the channel module is connected, that means the real channel.
 *
 *   pnpm make:sample
 */
import { DELIVERY_PAYLOAD_VERSION, type DeliveryPayload } from "@fpl/shared";
import { eventsWebhookTarget, postToMake } from "../src/make.ts";

const target = eventsWebhookTarget();
if ("missing" in target) {
  console.error(`Set ${target.missing.join(" and ")} in .env first.`);
  process.exit(1);
}

const payload: DeliveryPayload = {
  version: DELIVERY_PAYLOAD_VERSION,
  kind: "daily_report",
  headline: "Test delivery from FPL Gameweek Copilot",
  messages: [
    "<b>Test delivery from FPL Gameweek Copilot</b>\n\nIf you can read this, Scenario 1 works.",
    "<b>Second message</b>\n<i>Long reports arrive as several messages, in order.</i>",
  ],
  xDraft: "Test X draft — this one goes to your own chat, never the channel. #FPL",
  eventCount: 0,
};

const result = await postToMake(target, payload);
console.log(result.ok ? `Make accepted it (HTTP ${result.status}).` : `Failed: ${result.error}`);
if (!result.ok) process.exitCode = 1;
