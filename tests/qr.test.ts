import { expect, test } from "vitest";
import { qrPath, qrPng, qrSvg } from "@/lib/qr";

test("codes point to the short link, not the page", () => {
  expect(qrPath("acme")).toBe("/q/acme");
});

test("renders as SVG and PNG", async () => {
  const svg = await qrSvg("https://example.test/q/acme");
  expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);

  const png = await qrPng("https://example.test/q/acme", 256);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(256); // IHDR width
});
