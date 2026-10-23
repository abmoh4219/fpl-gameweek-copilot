/**
 * Sends ONE sample payload to a Make scenario (docs/make.md).
 *
 *   pnpm make:sample            Scenario 1 (events) — posts to the channel
 *                               once the channel module is connected
 *   pnpm make:sample preview    Scenario 2 (preview) — sends a realistic prompt,
 *                               prints Gemini's reply, its timing and
 *                               whether code would accept it
 *
 * Use it twice while building a scenario: first so Make's custom webhook can
 * learn the data structure, then to test the finished scenario end to end.
 */
import {
  DELIVERY_PAYLOAD_VERSION,
  INSIGHT_CONFIG,
  previewPrompt,
  validateProse,
  type DeliveryPayload,
  type PreviewFacts,
} from "@fpl/shared";
import { postToMake, requestProse, webhookTarget } from "../src/make.ts";

/** Facts in the shape previewFacts() produces, from the GW9 preview of 2026-10-23. */
const SAMPLE_FACTS: PreviewFacts = {
  gameweek: 9,
  deadline: "Saturday 31 October, 11:00 UK time",
  captainOptions: [
    { name: "Haaland", team: "MCI", position: "FWD", priceMillions: 15.7, expectedPoints: 6.3, goalThreat: "high", opponent: "AVL", venue: "away", onPenalties: true },
    { name: "Neto", team: "CHE", position: "MID", priceMillions: 6.5, expectedPoints: 6.7, goalThreat: "low", opponent: "TOT", venue: "home", onPenalties: false },
    { name: "Henderson", team: "CHE", position: "MID", priceMillions: 4.9, expectedPoints: 7, goalThreat: "low", opponent: "TOT", venue: "home", onPenalties: false },
    { name: "Evanilson", team: "BOU", position: "FWD", priceMillions: 6.1, expectedPoints: 6.3, goalThreat: "medium", opponent: "MUN", venue: "away", onPenalties: false },
    { name: "Iwobi", team: "FUL", position: "MID", priceMillions: 5.4, expectedPoints: 5, goalThreat: "medium", opponent: "COV", venue: "away", onPenalties: false },
  ],
  differentials: [
    { name: "Gonzalo", team: "FUL", ownershipPercent: 6.5, pointsLast4Gameweeks: 6, fixtureRun: "easy" },
    { name: "Iwobi", team: "FUL", ownershipPercent: 1.4, pointsLast4Gameweeks: 20, fixtureRun: "easy" },
    { name: "Rudoni", team: "COV", ownershipPercent: 0.6, pointsLast4Gameweeks: 18, fixtureRun: "easy" },
    { name: "Thiago", team: "BRE", ownershipPercent: 8.8, pointsLast4Gameweeks: 13, fixtureRun: "medium" },
    { name: "Delap", team: "NFO", ownershipPercent: 1.9, pointsLast4Gameweeks: 5, fixtureRun: "medium" },
  ],
  easiestFixtureRuns: [
    { team: "IPS", band: "Easy", difficulty: 2.4, fixtures: "NFO (home), HUL (away), BOU (home)" },
    { team: "FUL", band: "Easy", difficulty: 2.48, fixtures: "COV (away), AVL (away), NEW (home)" },
    { team: "COV", band: "Easy", difficulty: 2.5, fixtures: "FUL (home), SUN (home), EVE (away)" },
  ],
  hardestFixtureRuns: [
    { team: "BHA", band: "Hard", difficulty: 4.12, fixtures: "LIV (away), MCI (away), BRE (home)" },
    { team: "AVL", band: "Hard", difficulty: 3.47, fixtures: "MCI (home), FUL (home), MUN (away)" },
    { team: "LIV", band: "Medium", difficulty: 3.37, fixtures: "BHA (home), ARS (home), CRY (away)" },
  ],
  championsLeagueCongestion: [
    { team: "ARS", daysBeforeChampionsLeague: 3.1, daysAfterChampionsLeague: null },
    { team: "AVL", daysBeforeChampionsLeague: 3, daysAfterChampionsLeague: null },
    { team: "LIV", daysBeforeChampionsLeague: 3, daysAfterChampionsLeague: null },
    { team: "MUN", daysBeforeChampionsLeague: 3.3, daysAfterChampionsLeague: null },
  ],
};

const scenario = process.argv.includes("preview") ? "preview" : "events";
const target = webhookTarget(scenario);
if ("missing" in target) {
  console.error(`Set ${target.missing.join(" and ")} in .env first.`);
  process.exit(1);
}

if (scenario === "preview") {
  // A full-size prompt, from the shape of a real GW9 preview: the tiny
  // one-sentence prompt answered in 26 s while the real one took ~3 min, so
  // only a realistic prompt tells you whether a model is fast enough.
  const facts = SAMPLE_FACTS;
  console.log(`Sending a realistic ${previewPrompt(facts).length}-char prompt. Waiting for Gemini...`);
  const started = Date.now();
  const result = await requestProse(
    target,
    { version: 1, gameweek: facts.gameweek ?? 0, prompt: previewPrompt(facts) },
    INSIGHT_CONFIG.ai.timeoutMs,
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.ok && result.text !== null) {
    console.log(`Make answered (HTTP ${result.status}) in ${seconds}s. Gemini said:\n\n  ${result.text}\n`);
    const check = validateProse(result.text, facts);
    console.log(
      check.ok
        ? "Validation: PASSED — this prose would be published."
        : `Validation: REJECTED (${check.reason}) — the template would ship instead.`,
    );
    console.log(`Limit is ${INSIGHT_CONFIG.ai.timeoutMs / 1000}s; aim for well under it.`);
  } else {
    // While Make is only "determining the data structure", no Gemini module
    // has run yet, so "Accepted" here is expected the first time.
    console.log(`No prose back after ${seconds}s: ${result.error}`);
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

