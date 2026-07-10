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
};

/** 地価公示・地価調査ポイントの色（取引ポイントの青系と衝突しない黄系） */
export const LAND_PRICE_COLOR = "#eda100";

export const CHART_LINE_COLOR = "#2a78d6";

/**
 * 用途地域の色分けで参照するGeoJSONプロパティキー。
 * 実APIではキー名が異なる可能性が高いため、ここに一元化しておく。
 */
export const YOUTO_PROP_KEY = "用途地域";

/**
 * 用途地域の種別色。国交省の用途地域図の慣習配色に寄せた淡色
 * （住居系=緑〜黄、商業系=赤系、工業系=青紫系）。凡例とセットで使う。
 */
export const YOUTO_COLORS: Record<string, string> = {
  第一種低層住居専用地域: "#a8d8a8",
  第二種低層住居専用地域: "#c8e6b8",
  第一種中高層住居専用地域: "#b8e0c8",
  第二種中高層住居専用地域: "#d8ecc0",
  第一種住居地域: "#f5eea8",
  第二種住居地域: "#f7e3a0",
  準住居地域: "#f3d59a",
  近隣商業地域: "#f6c8c8",
  商業地域: "#f2a0a0",
  準工業地域: "#d8c0e8",
  工業地域: "#b8cce8",
  工業専用地域: "#a8b8d8",
};

export const YOUTO_FALLBACK_COLOR = "#cccccc";

export function priceColor(price: number): string {
  for (let i = 0; i < PRICE_BINS.length; i++) {
    if (price < PRICE_BINS[i]) return PRICE_COLORS[i];
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1];
}
