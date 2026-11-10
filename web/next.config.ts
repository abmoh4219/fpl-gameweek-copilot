import type { NextConfig } from "next";

const config: NextConfig = {
  // @fpl/shared ships TypeScript source with no build step (ADR-0004).
  transpilePackages: ["@fpl/shared", "@fpl/agent"],
  // Do not write an AGENTS.md into the repo on every `next dev`.
  agentRules: false,
  // No third-party scripts, no tracking pixels: a strict, simple header set.
  // /demo becomes its own page in phase C4; until then it opens the demo team.
  async redirects() {
    // Accounts are gone (ADR-0017): the old onboarding link finds your team instead.
    return [
      { source: "/onboarding", destination: "/team", permanent: false },
      // The demo page is gone (ADR-0018): the landing page shows the demo team live.
      { source: "/demo", destination: "/", permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // llms.txt is also expected under .well-known (ADR-0024).
        { source: "/.well-known/llms.txt", destination: "/llms.txt" },
        // An agent asking for Markdown gets the Markdown version of any page, or
        // a Markdown 404. A rewrite, not middleware: ordinary visitors never
        // send this header, so they pay nothing (ADR-0024).
        {
          source: "/:path((?!api/|_next/|md/|md$|index\\.md$|llms\\.txt$|openapi\\.json$|sitemap\\.xml$|robots\\.txt$).*)",
          has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
          destination: "/md/:path",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
