import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * A Gaffer tool: a name, a description the model reads, a Zod input shape,
 * and a handler. The same definition gives the API its JSON Schema and gives
 * the loop its validator, so the two can never disagree.
 */
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export interface GafferTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  handler: (args: never, extra?: unknown) => Promise<ToolResult>;
}

/** Same signature the tools were written against; the trailing hints are informational. */
export function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  handler: (args: z.infer<z.ZodObject<S>>, extra?: unknown) => Promise<ToolResult>,
  _hints?: unknown,
): GafferTool {
  return { name, description, schema: z.object(shape) as unknown as z.ZodObject<z.ZodRawShape>, handler: handler as GafferTool["handler"] };
}

/** The tool as the Messages API declares it. */
export function toApiTool(t: GafferTool): Anthropic.Tool {
  const { $schema: _drop, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return { name: t.name, description: t.description, input_schema: schema as Anthropic.Tool.InputSchema };
}
