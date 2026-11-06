"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Privacy-friendly page counts (ADR-0022): Vercel Web Analytics, no cookies,
 * nothing that identifies a visitor. Every page is counted; addresses that
 * carry a personal ID are grouped (/team/7653564 → /team/[id]), and query
 * strings are dropped, so the dashboard shows which tools people use, not
 * whose team they opened.
 */
const GROUPED = [/^\/team\/\d+/, /^\/league\/\d+/, /^\/wrapped\/\d+/];

export function groupUrl(raw: string): string {
  const url = new URL(raw);
  let path = url.pathname;
  for (const re of GROUPED) path = path.replace(re, (m) => m.replace(/\d+$/, "[id]"));
  return `${url.origin}${path}`;
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  return { ...event, url: groupUrl(event.url) };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
