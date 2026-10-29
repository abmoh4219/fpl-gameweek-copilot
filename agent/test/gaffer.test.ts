import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildSquad, OFF_TOPIC_REPLY, type AgentEvent } from "@fpl/shared";
import { all, cardRows, entry, picks } from "../../packages/shared/test/fixtures.ts";

// The loop never touches the network in these tests: data and Claude are injected.
vi.mock("../src/data.ts", () => ({ priceWatch: async () => [], latestPreview: async () => null }));
const { runGaffer, turnCostUsd } = await import("../src/gaffer.ts");

const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });
const data = { cards: all, teamCodes: new Map(all.map((c) => [c.fplId, 7])), runs: [] };
const usage = { input_tokens: 2000, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } as Anthropic.Usage;

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

/** A scripted Claude: each call to stream() plays the next turn. */
function fakeClient(turns: { blocks: Block[]; stop: "end_turn" | "tool_use" | "refusal" }[]) {
  const seen: Anthropic.MessageCreateParams[] = [];
  let i = 0;
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParams) {
        seen.push(structuredClone(params));
        const turn = turns[i++]!;
        const events = turn.blocks.flatMap((b, index): unknown[] =>
          b.type === "text"
            ? [
                { type: "content_block_start", index, content_block: { type: "text", text: "" } },
                { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } },
              ]
            : [{ type: "content_block_start", index, content_block: { ...b, input: {} } }],
        );
        return {
          async *[Symbol.asyncIterator]() {
            yield* events;
          },
          finalMessage: async () => ({ content: turn.blocks, stop_reason: turn.stop, usage }),
        };
      },
    },
  };
  return { client: client as unknown as Pick<Anthropic, "messages">, seen };
}

async function run(question: string, turns: Parameters<typeof fakeClient>[0], caller = `test-${Math.random()}`) {
  const events: AgentEvent[] = [];
  const fake = fakeClient(turns);
  await runGaffer({ squad, question, history: [], plan: null, caller }, (e) => events.push(e), { client: fake.client, data });
  return { events, seen: fake.seen };
}

describe("the Gaffer's loop", () => {
  it("runs a tool, sends its result back, then streams the answer and ends with one done", async () => {
    const { events, seen } = await run("Pick my best XI", [
      { blocks: [{ type: "tool_use", id: "c1", name: "pick_best_xi", input: {} }], stop: "tool_use" },
      { blocks: [{ type: "text", text: "Your best XI is on the pitch." }], stop: "end_turn" },
    ]);
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain("plan"); // the action reached the pitch
    expect(kinds.filter((k) => k === "done" || k === "error")).toEqual(["done"]);
    // Turn 2 carries the assistant's tool call and ONE user message of results.
    const second = seen[1]!.messages;
    expect(second.at(-2)!.role).toBe("assistant");
    const results = second.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results).toHaveLength(1);
    expect(results[0]!.tool_use_id).toBe("c1");
  });

  it("caches the frozen system prompt and sends the squad snapshot with the question", async () => {
    const { seen } = await run("Who should I captain?", [{ blocks: [{ type: "text", text: "Haaland." }], stop: "end_turn" }]);
    const system = seen[0]!.system as Anthropic.TextBlockParam[];
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(String(seen[0]!.messages[0]!.content)).toMatch(/Squad for GW\d+/);
  });

  it("rejects a tool call with invalid arguments without running it", async () => {
    const { events, seen } = await run("Bench someone", [
      { blocks: [{ type: "tool_use", id: "c1", name: "change_lineup", input: { start: "not-a-list" } }], stop: "tool_use" },
      { blocks: [{ type: "text", text: "Sorry." }], stop: "end_turn" },
    ]);
    const results = seen[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results[0]!.is_error).toBe(true);
    expect(events.some((e) => e.type === "plan")).toBe(false);
  });

  it("marks the fixed off-topic reply so it is never counted", async () => {
    const { events } = await run("what is python?", [{ blocks: [{ type: "text", text: OFF_TOPIC_REPLY }], stop: "end_turn" }]);
    expect(events.at(-1)).toMatchObject({ type: "done", offTopic: true });
  });

  it("stops at the turn limit with a note instead of looping", async () => {
    const loop = Array.from({ length: 10 }, (_, i) => ({
      blocks: [{ type: "tool_use" as const, id: `c${i}`, name: "rate_lineup", input: {} }],
      stop: "tool_use" as const,
    }));
    const { events, seen } = await run("Rate it again and again", loop);
    expect(seen.length).toBeLessThanOrEqual(6);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toMatch(/per-question limit/);
    expect(events.at(-1)!.type).toBe("done");
  });

  it("prices a turn from the reported tokens", () => {
    // 2000 input at $0.10/M + 150 output at $0.50/M
    expect(turnCostUsd(usage)).toBeCloseTo(0.000275, 7);
  });
});
