import { describe, expect, it } from "vitest";
import {
  aggregateByPeriod,
  median,
  medianOfRecentQuarters,
  parseNumeric,
  parsePeriod,
  recentQuarters,
} from "../src/lib/stats.js";

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

describe("recentQuarters", () => {
  it("現在を含む直近N四半期を新しい順で返す", () => {
    const now = new Date(2026, 6, 9); // 2026 Q3
    expect(recentQuarters(4, now)).toEqual(["2026Q3", "2026Q2", "2026Q1", "2025Q4"]);
  });
  it("年またぎ（Q1起点）", () => {
    const now = new Date(2026, 0, 15); // 2026 Q1
    expect(recentQuarters(2, now)).toEqual(["2026Q1", "2025Q4"]);
  });
});

describe("medianOfRecentQuarters", () => {
  const now = new Date(2026, 6, 9); // 2026 Q3
  it("直近N四半期のレコードだけで中央値と件数を出す", () => {
    const records = [
      { Period: "2026年第３四半期", TradePrice: "300" },
      { Period: "2026年第２四半期", TradePrice: "100" },
      { Period: "2025年第４四半期", TradePrice: "200" }, // 4四半期前=ちょうど境界内
      { Period: "2025年第３四半期", TradePrice: "9999" }, // 5四半期前=範囲外
    ];
    expect(medianOfRecentQuarters(records, 4, now)).toEqual({ median: 200, count: 3 });
  });
  it("範囲内が0件なら null", () => {
    const records = [{ Period: "2020年第１四半期", TradePrice: "100" }];
    expect(medianOfRecentQuarters(records, 4, now)).toBeNull();
    expect(medianOfRecentQuarters([], 4, now)).toBeNull();
  });
  it("パース不能レコードは無視する", () => {
    const records = [
      { Period: "2026年第３四半期", TradePrice: "非公開" },
      { Period: "2026年第３四半期", TradePrice: "500" },
    ];
    expect(medianOfRecentQuarters(records, 1, now)).toEqual({ median: 500, count: 1 });
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
