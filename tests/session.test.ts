import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, SESSION_DAYS, verifySessionToken } from "@/lib/session";

const secret = process.env.SESSION_SECRET;
afterEach(() => {
  process.env.SESSION_SECRET = secret;
});

describe("session tokens", () => {
  it("round-trips the owner id and session version", async () => {
    const { token } = await createSessionToken("abc123", 4);
    expect(await verifySessionToken(token)).toEqual({ ownerId: "abc123", version: 4 });
  });

  it("rejects a token whose version was edited", async () => {
    const { token } = await createSessionToken("abc123", 0);
    const [id, , exp, sig] = token.split(".");
    expect(await verifySessionToken(`${id}.5.${exp}.${sig}`)).toBeNull();
  });

  it("rejects a token signed for another owner", async () => {
    const { token } = await createSessionToken("abc123", 0);
    expect(await verifySessionToken(token.replace(/^abc123/, "def456"))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const { token } = await createSessionToken("abc123", 0, now);
    expect(await verifySessionToken(token, now + SESSION_DAYS * 86_400_000 + 1000)).toBeNull();
  });

  it("rejects the old three-part format", async () => {
    const { token } = await createSessionToken("abc123", 0);
    const [id, , exp, sig] = token.split(".");
    expect(await verifySessionToken(`${id}.${exp}.${sig}`)).toBeNull();
  });

  it("rejects everything once SESSION_SECRET changes", async () => {
    const { token } = await createSessionToken("abc123", 0);
    process.env.SESSION_SECRET = "another-secret-that-is-at-least-32-characters";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("fails closed without a secret", async () => {
    const { token } = await createSessionToken("abc123", 0);
    delete process.env.SESSION_SECRET;
    expect(await verifySessionToken(token)).toBeNull();
    await expect(createSessionToken("abc123", 0)).rejects.toThrow();
  });
});
