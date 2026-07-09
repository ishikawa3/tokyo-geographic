/** XIT001系の数値フィールドは文字列。数値化できなければ null。 */
export function parseNumeric(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 円 → "1.2億円" / "3,500万円" / "5,000円" */
export function formatPrice(yen: number): string {
  if (yen >= 100_000_000) {
    const oku = Math.round((yen / 100_000_000) * 10) / 10;
    return `${oku.toLocaleString("ja-JP")}億円`;
  }
  if (yen >= 10_000) {
    return `${Math.round(yen / 10_000).toLocaleString("ja-JP")}万円`;
  }
  return `${yen.toLocaleString("ja-JP")}円`;
}

/** Y軸など省スペース用: "1.2億" / "3500万" */
export function formatPriceShort(yen: number): string {
  if (yen >= 100_000_000) {
    return `${Math.round((yen / 100_000_000) * 10) / 10}億`;
  }
  return `${Math.round(yen / 10_000)}万`;
}

/** DetailPanel の表示順とラベル。ここにないキーは表示しない。 */
export const PROP_LABELS: Array<[key: string, label: string]> = [
  ["Type", "種類"],
  ["Municipality", "市区町村"],
  ["DistrictName", "地区名"],
  ["Area", "面積（㎡）"],
  ["UnitPrice", "㎡単価"],
  ["BuildingYear", "建築年"],
  ["Structure", "構造"],
  ["Use", "用途"],
  ["CityPlanning", "都市計画"],
  ["Period", "取引時期"],
];

export interface QuarterOption {
  value: string; // YYYYN
  label: string; // "2024 Q1"
}

/** 2015Q1〜現在の四半期までの選択肢（新しい順） */
export function quarterOptions(startYear = 2015, now = new Date()): QuarterOption[] {
  const currentYear = now.getFullYear();
  const currentQ = Math.floor(now.getMonth() / 3) + 1;
  const options: QuarterOption[] = [];
  for (let y = currentYear; y >= startYear; y--) {
    const maxQ = y === currentYear ? currentQ : 4;
    for (let q = maxQ; q >= 1; q--) {
      options.push({ value: `${y}${q}`, label: `${y} Q${q}` });
    }
  }
  return options;
}

/** 直近N四半期前の YYYYN（デフォルト期間の計算用） */
export function quartersAgo(n: number, now = new Date()): string {
  const total = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - n;
  return `${Math.floor(total / 4)}${(total % 4) + 1}`;
}
