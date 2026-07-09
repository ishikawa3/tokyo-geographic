import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_LINE_COLOR } from "../lib/colors";
import { formatPrice, formatPriceShort } from "../lib/format";
import type { HistoryPoint } from "../types";

/** "2024Q1" → "'24Q1" */
function shortPeriod(period: string): string {
  return `'${period.slice(2)}`;
}

export function PriceChart({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) {
    return <p className="chart-empty">この期間の取引データがありません</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e1e0d9" strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={shortPeriod}
          tick={{ fontSize: 10, fill: "#898781" }}
          tickLine={false}
          axisLine={{ stroke: "#c3c2b7" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatPriceShort}
          tick={{ fontSize: 10, fill: "#898781" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          formatter={(value: number | string, _name, item) => {
            const count = (item?.payload as HistoryPoint | undefined)?.count;
            return [`${formatPrice(Number(value))}（${count ?? "-"}件）`, "中央値"];
          }}
          labelFormatter={(label: string) => label}
          contentStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="median"
          stroke={CHART_LINE_COLOR}
          strokeWidth={2}
          dot={{ r: 2.5, fill: CHART_LINE_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
