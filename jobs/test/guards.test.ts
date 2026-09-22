import { describe, expect, it } from "vitest";
import { assertDatabaseAllowed, isLocalDatabase, LOCAL_DB_URL } from "../src/db.ts";
import { redactSecrets } from "../src/telegram.ts";

const CLOUD_URL = "postgresql://postgres:hunter2@db.abcdefgh.supabase.co:5432/postgres";

describe("non-local database guard", () => {
  it("always allows a local database", () => {
    expect(isLocalDatabase(LOCAL_DB_URL)).toBe(true);
    expect(() => assertDatabaseAllowed(LOCAL_DB_URL)).not.toThrow();
  });

  it("refuses a cloud database by default", () => {
    expect(isLocalDatabase(CLOUD_URL)).toBe(false);
    expect(() => assertDatabaseAllowed(CLOUD_URL)).toThrow(/Refusing to run against a non-local/);
  });

  it("allows a cloud database with an explicit --cloud", () => {
    expect(() => assertDatabaseAllowed(CLOUD_URL, true)).not.toThrow();
  });

  it("allows a cloud database inside GitHub Actions", () => {
    const previous = process.env["GITHUB_ACTIONS"];
    process.env["GITHUB_ACTIONS"] = "true";
    try {
      expect(() => assertDatabaseAllowed(CLOUD_URL)).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env["GITHUB_ACTIONS"];
      else process.env["GITHUB_ACTIONS"] = previous;
    }
  });

  it("recognises localhost and IPv6 loopback too", () => {
    expect(isLocalDatabase("postgresql://postgres:postgres@localhost:54322/postgres")).toBe(true);
    expect(isLocalDatabase("postgresql://postgres:postgres@[::1]:54322/postgres")).toBe(true);
  });

  it("does not mistake a hostname containing 'localhost' for local", () => {
    expect(isLocalDatabase("postgresql://u:p@localhost.evil.example.com:5432/db")).toBe(false);
  });
});

describe("secret redaction", () => {
  it("removes connection strings, including the password", () => {
    const text = redactSecrets(`connect failed: ${CLOUD_URL}`);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("db.abcdefgh.supabase.co");
  });

  it("removes Telegram bot tokens", () => {
    const text = redactSecrets("bot 123456789:AAFakeTokenValueThatIsLongEnough12345 failed");
    expect(text).not.toContain("AAFakeTokenValueThatIsLongEnough12345");
  });

  it("removes Supabase keys and JWTs", () => {
    expect(redactSecrets("sb_secret_abc123XYZ_def")).not.toContain("abc123XYZ");
    expect(
      redactSecrets("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature"),
    ).not.toContain("eyJhbGci");
  });

  it("scrubs the VALUE of a known secret env var wherever it appears", () => {
    const previous = process.env["FOOTBALL_DATA_API_TOKEN"];
    process.env["FOOTBALL_DATA_API_TOKEN"] = "abcdef0123456789abcdef0123456789";
    try {
      const text = redactSecrets("X-Auth-Token: abcdef0123456789abcdef0123456789 rejected");
      expect(text).not.toContain("abcdef0123456789");
      expect(text).toContain("[redacted:FOOTBALL_DATA_API_TOKEN]");
    } finally {
      if (previous === undefined) delete process.env["FOOTBALL_DATA_API_TOKEN"];
      else process.env["FOOTBALL_DATA_API_TOKEN"] = previous;
    }
  });

  it("leaves ordinary error text alone", () => {
    expect(redactSecrets("relation core.players does not exist")).toBe(
      "relation core.players does not exist",
    );
  });
});
