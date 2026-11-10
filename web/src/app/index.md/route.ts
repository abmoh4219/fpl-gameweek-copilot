import { markdownResponse, pageMarkdown } from "@/lib/markdown";

/** The home page as Markdown (ADR-0024). */
export async function GET() {
  return markdownResponse(await pageMarkdown([]).catch(() => null));
}
