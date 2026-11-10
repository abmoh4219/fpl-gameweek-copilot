import { markdownResponse, pageMarkdown } from "@/lib/markdown";

/** Markdown versions of the public pages (ADR-0024); unknown paths answer 404 with where to look next. */
export async function GET(_: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  return markdownResponse(await pageMarkdown(path).catch(() => null), `/${path.join("/")}`);
}
