import { expect, test } from "vitest";
import { normalizeSocial, socialLinksOf } from "@/lib/socials";

test("handles become profile links on that network", () => {
  expect(normalizeSocial("facebook", "mycourts")).toBe("https://www.facebook.com/mycourts");
  expect(normalizeSocial("instagram", "@my.courts")).toBe("https://www.instagram.com/my.courts");
  expect(normalizeSocial("tiktok", "@mycourts")).toBe("https://www.tiktok.com/@mycourts");
  expect(normalizeSocial("youtube", "mycourts")).toBe("https://www.youtube.com/@mycourts");
  expect(normalizeSocial("x", "mycourts")).toBe("https://x.com/mycourts");
});

test("links on the network are kept, upgraded to https", () => {
  expect(normalizeSocial("facebook", "https://www.facebook.com/mycourts")).toBe("https://www.facebook.com/mycourts");
  expect(normalizeSocial("facebook", "m.facebook.com/profile.php?id=123")).toBe("https://m.facebook.com/profile.php?id=123");
  expect(normalizeSocial("x", "http://twitter.com/mycourts#top")).toBe("https://twitter.com/mycourts");
  expect(normalizeSocial("youtube", "youtube.com/@mycourts")).toBe("https://youtube.com/@mycourts");
});

test("blank is empty, anything else is rejected", () => {
  expect(normalizeSocial("facebook", "  ")).toBe("");
  expect(normalizeSocial("facebook", "https://evil.example/facebook.com/x")).toBeNull();
  expect(normalizeSocial("facebook", "https://facebook.com.evil.example/x")).toBeNull();
  expect(normalizeSocial("instagram", "https://www.facebook.com/mycourts")).toBeNull();
  expect(normalizeSocial("instagram", "javascript:alert(1)")).toBeNull();
  expect(normalizeSocial("facebook", "https://facebook.com/")).toBeNull();
  expect(normalizeSocial("facebook", "facebook.com")).toBeNull();
  expect(normalizeSocial("tiktok", "my courts")).toBeNull();
});

test("socialLinksOf lists only the filled networks, in display order", () => {
  expect(socialLinksOf(undefined)).toEqual([]);
  expect(socialLinksOf({ x: "https://x.com/a", facebook: "https://www.facebook.com/a", tiktok: "" }).map((l) => l.key)).toEqual(["facebook", "x"]);
});
