import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, createViewAsToken, SESSION_DAYS, VIEW_AS_MINUTES, verifySessionToken, verifyViewAsToken } from "@/lib/session";

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

describe("view-as tokens", () => {
  const admin = { ownerId: "a1a1", version: 2 };

  it("round-trips the admin, their session version and the partner", async () => {
    const now = Date.now();
    const { token } = await createViewAsToken(admin, "b2b2", now);
    expect(await verifyViewAsToken(token, now)).toMatchObject({ adminId: "a1a1", adminVersion: 2, ownerId: "b2b2" });
  });

  it("rejects a token whose partner was edited", async () => {
    const { token } = await createViewAsToken(admin, "b2b2");
    expect(await verifyViewAsToken(token.replace(".b2b2.", ".c3c3."))).toBeNull();
  });

  it("expires after VIEW_AS_MINUTES", async () => {
    const now = Date.now();
    const { token } = await createViewAsToken(admin, "b2b2", now);
    expect(await verifyViewAsToken(token, now + VIEW_AS_MINUTES * 60_000 - 1000)).not.toBeNull();
    expect(await verifyViewAsToken(token, now + VIEW_AS_MINUTES * 60_000 + 1000)).toBeNull();
  });

  it("can't be swapped with a session token", async () => {
    const session = (await createSessionToken("a1a1", 2)).token;
    const viewAs = (await createViewAsToken(admin, "b2b2")).token;
    expect(await verifyViewAsToken(session)).toBeNull();
    expect(await verifySessionToken(viewAs)).toBeNull();
    // Same fields, but signed as a session: still not a view-as token.
    const [id, version, , exp] = viewAs.split(".");
    const forged = (await createSessionToken(id, Number(version))).token.split(".");
    expect(await verifyViewAsToken(`${id}.${version}.b2b2.${exp}.${forged[3]}`)).toBeNull();
  });

  it("fails closed without a secret", async () => {
    const { token } = await createViewAsToken(admin, "b2b2");
    delete process.env.SESSION_SECRET;
    expect(await verifyViewAsToken(token)).toBeNull();
    await expect(createViewAsToken(admin, "b2b2")).rejects.toThrow();
  });
});
