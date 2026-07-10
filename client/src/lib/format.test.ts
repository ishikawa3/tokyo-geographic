import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceShort, parseNumeric, quarterOptions, quartersAgo } from "./format";

describe("parseNumeric", () => {
  it("文字列数値をパースする", () => {
    expect(parseNumeric("120000000")).toBe(120000000);
    expect(parseNumeric("1,200")).toBe(1200);
  });
  it("非数値は null", () => {
    expect(parseNumeric("非公開")).toBeNull();
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
    expect(parseNumeric(null)).toBeNull();
  });
});

describe("formatPrice", () => {
  it("1億以上は億円表記", () => {
    expect(formatPrice(120_000_000)).toBe("1.2億円");
    expect(formatPrice(100_000_000)).toBe("1億円");
    expect(formatPrice(1_230_000_000)).toBe("12.3億円");
  });
  it("1万以上は万円表記", () => {
    expect(formatPrice(35_000_000)).toBe("3,500万円");
    expect(formatPrice(9_800_000)).toBe("980万円");
  });
  it("1万未満は円表記", () => {
    expect(formatPrice(5_000)).toBe("5,000円");
  });
});

describe("formatPriceShort", () => {
  it("軸ラベル用の短縮表記", () => {
    expect(formatPriceShort(120_000_000)).toBe("1.2億");
    expect(formatPriceShort(35_000_000)).toBe("3500万");
  });
});

describe("quarterOptions", () => {
  it("現在の四半期から開始年まで新しい順に生成する", () => {
    const now = new Date(2026, 6, 9); // 2026-07-09 = Q3
    const opts = quarterOptions(2025, now);
    expect(opts[0]).toEqual({ value: "20263", label: "2026 Q3" });
    expect(opts[opts.length - 1]).toEqual({ value: "20251", label: "2025 Q1" });
    expect(opts).toHaveLength(7);
  });
});

describe("quartersAgo", () => {
  it("N四半期前を YYYYN で返す", () => {
    const now = new Date(2026, 6, 9); // 2026 Q3
    expect(quartersAgo(0, now)).toBe("20263");
    expect(quartersAgo(4, now)).toBe("20253");
    expect(quartersAgo(2, now)).toBe("20261");
  });
});
