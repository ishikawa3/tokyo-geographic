/**
 * 価格5段階の色: 青系シーケンシャル（順序）ランプ。
 * 地理院淡色タイル(#f5f5f0相当)に対して dataviz バリデータで検証済み
 * （明度単調・隣接ΔL・明端コントラスト2:1以上・単一色相）。
 */
export const PRICE_BINS = [30_000_000, 60_000_000, 100_000_000, 300_000_000];
export const PRICE_COLORS = ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
export const PRICE_BIN_LABELS = [
  "3,000万円未満",
  "3,000万〜6,000万円",
  "6,000万〜1億円",
  "1億〜3億円",
  "3億円以上",
];

/**
 * ハザードレイヤーの色: レイヤーの「識別」なのでカテゴリカル。
 * 価格ランプ（青）と衝突しない色相をカテゴリカルパレットの固定順で割当。
 */
export const HAZARD_COLORS: Record<string, string> = {
  flood: "#1baf7a", // aqua
  landslide: "#eb6834", // orange
  tsunami: "#4a3aa7", // violet
  "storm-surge": "#e87ba4", // magenta
  "land-price-points": "#eda100", // yellow
};

export const CHART_LINE_COLOR = "#2a78d6";

export function priceColor(price: number): string {
  for (let i = 0; i < PRICE_BINS.length; i++) {
    if (price < PRICE_BINS[i]) return PRICE_COLORS[i];
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1];
}
