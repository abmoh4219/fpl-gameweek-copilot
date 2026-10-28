import type { NextConfig } from "next";

const config: NextConfig = {
  // @fpl/shared ships TypeScript source with no build step (ADR-0004).
  transpilePackages: ["@fpl/shared"],
  // Do not write an AGENTS.md into the repo on every `next dev`.
  agentRules: false,
  // No third-party scripts, no tracking pixels: a strict, simple header set.
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
