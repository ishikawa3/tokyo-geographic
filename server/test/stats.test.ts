import { describe, expect, it } from "vitest";
import { aggregateByPeriod, median, parseNumeric, parsePeriod } from "../src/lib/stats.js";

describe("parseNumeric", () => {
  it("文字列の数値をパースする", () => {
    expect(parseNumeric("120000000")).toBe(120000000);
    expect(parseNumeric("1,200,000")).toBe(1200000);
    expect(parseNumeric(" 42 ")).toBe(42);
  });
  it("空・非数値・欠損は null", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("非公開")).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
    expect(parseNumeric(null)).toBeNull();
  });
});

describe("parsePeriod", () => {
  it("全角数字の四半期表記をパースする", () => {
    expect(parsePeriod("2024年第１四半期")).toBe("2024Q1");
    expect(parsePeriod("2021年第４四半期")).toBe("2021Q4");
  });
  it("半角数字も受け付ける", () => {
    expect(parsePeriod("2023年第2四半期")).toBe("2023Q2");
  });
  it("解釈不能は null", () => {
    expect(parsePeriod("2024年")).toBeNull();
    expect(parsePeriod("第１四半期")).toBeNull();
    expect(parsePeriod("2024年第５四半期")).toBeNull();
    expect(parsePeriod(undefined)).toBeNull();
  });
});

describe("median", () => {
  it("奇数個は中央値", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("偶数個は中央2値の平均", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("空配列は null", () => {
    expect(median([])).toBeNull();
  });
  it("元配列を破壊しない", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe("aggregateByPeriod", () => {
  it("四半期ごとに中央値と件数を集計し period 昇順で返す", () => {
    const records = [
      { Period: "2024年第２四半期", TradePrice: "100" },
      { Period: "2024年第１四半期", TradePrice: "50" },
      { Period: "2024年第２四半期", TradePrice: "300" },
      { Period: "2024年第２四半期", TradePrice: "200" },
    ];
    expect(aggregateByPeriod(records)).toEqual([
      { period: "2024Q1", median: 50, count: 1 },
      { period: "2024Q2", median: 200, count: 3 },
    ]);
  });
  it("パース不能なレコードはスキップする", () => {
    const records = [
      { Period: "2024年第１四半期", TradePrice: "100" },
      { Period: "不明", TradePrice: "999" },
      { Period: "2024年第１四半期", TradePrice: "非公開" },
    ];
    expect(aggregateByPeriod(records)).toEqual([{ period: "2024Q1", median: 100, count: 1 }]);
  });
  it("空入力は空配列", () => {
    expect(aggregateByPeriod([])).toEqual([]);
  });
});
