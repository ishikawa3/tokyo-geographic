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
