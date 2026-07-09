import { HAZARD_COLORS, PRICE_BIN_LABELS, PRICE_COLORS } from "../lib/colors";
import { quarterOptions } from "../lib/format";
import type { LayerInfo, PeriodRange, PointDisplayMode } from "../types";

const POINT_MODES: Array<{ value: PointDisplayMode; label: string }> = [
  { value: "points", label: "ポイント" },
  { value: "heatmap", label: "ヒートマップ" },
  { value: "off", label: "非表示" },
];

interface LayerPanelProps {
  layers: LayerInfo[];
  pointMode: PointDisplayMode;
  onPointModeChange: (mode: PointDisplayMode) => void;
  activeHazards: string[];
  onToggleHazard: (id: string) => void;
  period: PeriodRange;
  onPeriodChange: (period: PeriodRange) => void;
  mock: boolean;
}

export function LayerPanel({
  layers,
  pointMode,
  onPointModeChange,
  activeHazards,
  onToggleHazard,
  period,
  onPeriodChange,
  mock,
}: LayerPanelProps) {
  const quarters = quarterOptions();
  const hazardLayers = layers.filter((l) => l.kind === "polygon");

  return (
    <div className="layer-panel">
      <h1 className="panel-title">
        東京 不動産価格 × 災害リスク
        {mock && <span className="mock-badge">モックデータ</span>}
      </h1>

      <section>
        <h2>取引価格の表示</h2>
        <div className="radio-row">
          {POINT_MODES.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                name="point-mode"
                checked={pointMode === m.value}
                onChange={() => onPointModeChange(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="period-row">
          <select
            value={period.from}
            onChange={(e) => onPeriodChange({ ...period, from: e.target.value })}
            aria-label="期間（開始）"
          >
            {quarters.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
          <span>〜</span>
          <select
            value={period.to}
            onChange={(e) => onPeriodChange({ ...period, to: e.target.value })}
            aria-label="期間（終了）"
          >
            {quarters.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h2>ハザード情報</h2>
        {hazardLayers.map((l) => (
          <label key={l.id} className="hazard-row">
            <input
              type="checkbox"
              checked={activeHazards.includes(l.id)}
              onChange={() => onToggleHazard(l.id)}
            />
            <span className="color-chip" style={{ background: HAZARD_COLORS[l.id] ?? "#888" }} />
            {l.label}
            {!l.wired && !mock && <span className="unwired-note">（未接続）</span>}
          </label>
        ))}
      </section>

      <section>
        <h2>凡例（取引価格）</h2>
        {PRICE_BIN_LABELS.map((label, i) => (
          <div key={label} className="legend-row">
            <span className="color-chip round" style={{ background: PRICE_COLORS[i] }} />
            {label}
          </div>
        ))}
      </section>
    </div>
  );
}
