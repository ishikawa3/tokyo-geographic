/** XIT001 の数値フィールドは文字列で返る。"120000000" → 120000000。空・非数値は null。 */
export function parseNumeric(s: string | undefined | null): number | null {
  if (s == null) return null;
  const normalized = s.trim().replace(/,/g, "");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** 全角数字 → 半角数字 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** "2024年第１四半期"（全角数字あり得る）→ "2024Q1"。解釈不能なら null。 */
export function parsePeriod(s: string | undefined | null): string | null {
  if (s == null) return null;
  const m = toHalfWidth(s.trim()).match(/^(\d{4})年第([1-4])四半期$/);
  if (!m) return null;
  return `${m[1]}Q${m[2]}`;
}

/** 中央値。空配列は null。偶数個は中央2値の平均。 */
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PeriodStat {
  period: string;
  median: number;
  count: number;
}

/** 現在（now）を含む直近N四半期の "YYYYQN" 一覧（新しい順） */
export function recentQuarters(n: number, now = new Date()): string[] {
  const total = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  return Array.from({ length: n }, (_, i) => {
    const t = total - i;
    return `${Math.floor(t / 4)}Q${(t % 4) + 1}`;
  });
}

/**
 * 直近N四半期に該当するレコードだけで TradePrice の中央値と件数を計算。
 * 対象が0件なら null。
 */
export function medianOfRecentQuarters(
  records: Array<{ Period?: string; TradePrice?: string }>,
  quarters: number,
  now = new Date(),
): { median: number; count: number } | null {
  const target = new Set(recentQuarters(quarters, now));
  const prices: number[] = [];
  for (const r of records) {
    const period = parsePeriod(r.Period);
    const price = parseNumeric(r.TradePrice);
    if (period !== null && price !== null && target.has(period)) prices.push(price);
  }
  const m = median(prices);
  return m === null ? null : { median: m, count: prices.length };
}

/** XIT001 レコード配列 → 四半期ごとの TradePrice 中央値・件数（period 昇順） */
export function aggregateByPeriod(
  records: Array<{ Period?: string; TradePrice?: string }>,
): PeriodStat[] {
  const byPeriod = new Map<string, number[]>();
  for (const r of records) {
    const period = parsePeriod(r.Period);
    const price = parseNumeric(r.TradePrice);
    if (period === null || price === null) continue;
    const bucket = byPeriod.get(period);
    if (bucket) bucket.push(price);
    else byPeriod.set(period, [price]);
  }
  return [...byPeriod.entries()]
    .map(([period, prices]) => ({ period, median: median(prices)!, count: prices.length }))
    .sort((a, b) => a.period.localeCompare(b.period));
}
