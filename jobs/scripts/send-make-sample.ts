/**
 * Sends ONE sample payload to a Make scenario (docs/make.md).
 *
 *   pnpm make:sample            Scenario 1 (events) — posts to the channel
 *                               once the channel module is connected
 *   pnpm make:sample preview    Scenario 2 (preview) — prints Gemini's reply
 *
 * Use it twice while building a scenario: first so Make's custom webhook can
 * learn the data structure, then to test the finished scenario end to end.
 */
import { DELIVERY_PAYLOAD_VERSION, INSIGHT_CONFIG, type DeliveryPayload } from "@fpl/shared";
import { postToMake, requestProse, webhookTarget } from "../src/make.ts";

const scenario = process.argv.includes("preview") ? "preview" : "events";
const target = webhookTarget(scenario);
if ("missing" in target) {
  console.error(`Set ${target.missing.join(" and ")} in .env first.`);
  process.exit(1);
}

if (scenario === "preview") {
  console.log("Waiting for Gemini (can take a minute or two when it is busy)...");
  const started = Date.now();
  const result = await requestProse(
    target,
    {
      version: 1,
      gameweek: 0,
      prompt: "Reply with one short sentence confirming you are ready to write Fantasy Premier League previews.",
    },
    INSIGHT_CONFIG.ai.timeoutMs,
  );
  if (result.ok) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`Make answered (HTTP ${result.status}) in ${seconds}s. Gemini said:\n\n  ${result.text}\n`);
  } else {
    // While Make is only "determining the data structure", no Gemini module
    // has run yet, so "Accepted" here is expected the first time.
    console.log(`No prose back: ${result.error}`);
    process.exitCode = 1;
  }
} else {
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
}
