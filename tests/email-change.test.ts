import { describe, expect, it } from "vitest";
import { createEmailChangeToken, emailChangeMatches, EMAIL_CHANGE_MINUTES, readEmailChangeToken } from "@/lib/email-change";

const owner = { id: "abc123", email: "old@example.test" };

describe("email change links", () => {
  it("carry the new address for the owner who asked", () => {
    const token = createEmailChangeToken(owner, "new@example.test");
    expect(readEmailChangeToken(token)).toEqual({ ownerId: "abc123", newEmail: "new@example.test" });
    expect(emailChangeMatches(owner, token)).toBe(true);
  });

  it("stop working once the email has changed", () => {
    const token = createEmailChangeToken(owner, "new@example.test");
    expect(emailChangeMatches({ ...owner, email: "new@example.test" }, token)).toBe(false);
  });

  it("can't be pointed at a different address", () => {
    const [id, exp, , sig] = createEmailChangeToken(owner, "new@example.test").split(".");
    const forged = `${id}.${exp}.${Buffer.from("attacker@example.test").toString("base64url")}.${sig}`;
    expect(emailChangeMatches(owner, forged)).toBe(false);
  });

  it("don't work for another owner", () => {
    const token = createEmailChangeToken(owner, "new@example.test");
    expect(emailChangeMatches({ ...owner, id: "def456" }, token)).toBe(false);
  });

  it("expire", () => {
    const old = createEmailChangeToken(owner, "new@example.test", Date.now() - (EMAIL_CHANGE_MINUTES + 1) * 60_000);
    expect(readEmailChangeToken(old)).toBeNull();
    expect(readEmailChangeToken("garbage")).toBeNull();
  });
});
