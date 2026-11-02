import { describe, expect, it } from "vitest";
import { formatDistance, haversineKm, isLatLng } from "@/lib/geo";

const makati = { lat: 14.5547, lng: 121.0244 }; // Ayala Triangle
const bgc = { lat: 14.5509, lng: 121.0503 }; // BGC High Street
const cebu = { lat: 10.3157, lng: 123.8854 };

describe("haversineKm", () => {
  it("measures short and long distances", () => {
    expect(haversineKm(makati, bgc)).toBeCloseTo(2.8, 1);
    expect(haversineKm(makati, cebu)).toBeGreaterThan(560);
    expect(haversineKm(makati, cebu)).toBeLessThan(570);
    expect(haversineKm(makati, makati)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre and fewer decimals far away", () => {
    expect(formatDistance(0.004)).toBe("10 m");
    expect(formatDistance(0.846)).toBe("850 m");
    expect(formatDistance(2.34)).toBe("2.3 km");
    expect(formatDistance(18.4)).toBe("18 km");
  });
});

describe("isLatLng", () => {
  it("rejects missing and out-of-range values", () => {
    expect(isLatLng(14.5, 121)).toBe(true);
    expect(isLatLng(NaN, 121)).toBe(false);
    expect(isLatLng(91, 121)).toBe(false);
    expect(isLatLng("14.5", 121)).toBe(false);
  });
});
