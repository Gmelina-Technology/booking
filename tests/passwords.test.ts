import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createResetToken, ownerForResetToken, resetTokenMatches } from "@/lib/password-reset";

describe("password hashing", () => {
  it("accepts the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("rejects any password for an unknown account", async () => {
    expect(await verifyPassword("anything", undefined)).toBe(false);
  });
});

describe("password reset tokens", () => {
  const owner = { id: "abc123", passwordHash: "scrypt$16384$salt$hash" };

  it("matches the owner it was made for", () => {
    expect(resetTokenMatches(owner, createResetToken(owner))).toBe(true);
  });

  it("stops working once the password changes", () => {
    const token = createResetToken(owner);
    expect(resetTokenMatches({ ...owner, passwordHash: "scrypt$16384$salt$other" }, token)).toBe(false);
  });

  it("doesn't work for another owner", () => {
    const token = createResetToken(owner);
    expect(resetTokenMatches({ ...owner, id: "def456" }, token)).toBe(false);
  });

  it("rejects an edited signature", () => {
    const token = createResetToken(owner);
    expect(resetTokenMatches(owner, token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA"))).toBe(false);
  });

  it("treats expired and malformed links as unknown", async () => {
    const old = createResetToken(owner, Date.now() - 60 * 60 * 1000);
    expect(await ownerForResetToken(old)).toBeNull();
    expect(await ownerForResetToken("not-a-token")).toBeNull();
  });
});
