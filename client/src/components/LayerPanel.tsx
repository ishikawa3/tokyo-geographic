import {
  HAZARD_COLORS,
  LAND_PRICE_COLOR,
  PRICE_BIN_LABELS,
  PRICE_COLORS,
  YOUTO_COLORS,
} from "../lib/colors";
import { quarterOptions } from "../lib/format";
import type { LayerInfo, PeriodRange, PointDisplayMode } from "../types";

const POINT_MODES: Array<{ value: PointDisplayMode; label: string }> = [
  { value: "points", label: "ポイント" },
  { value: "heatmap", label: "ヒートマップ" },
  { value: "off", label: "非表示" },
];

const LAND_PRICE_START_YEAR = 2015;

interface LayerPanelProps {
  layers: LayerInfo[];
  pointMode: PointDisplayMode;
  onPointModeChange: (mode: PointDisplayMode) => void;
  showLandPrice: boolean;
  onToggleLandPrice: () => void;
  landPriceYear: string;
  onLandPriceYearChange: (year: string) => void;
  activeOverlays: string[];
  onToggleOverlay: (id: string) => void;
  period: PeriodRange;
  onPeriodChange: (period: PeriodRange) => void;
  mock: boolean;
  onClose: () => void;
}

export function LayerPanel({
  layers,
  pointMode,
  onPointModeChange,
  showLandPrice,
  onToggleLandPrice,
  landPriceYear,
  onLandPriceYearChange,
  activeOverlays,
  onToggleOverlay,
  period,
  onPeriodChange,
  mock,
  onClose,
}: LayerPanelProps) {
  const quarters = quarterOptions();
  const hazardLayers = layers.filter((l) => l.group === "hazard");
  const cityplanLayers = layers.filter((l) => l.group === "cityplan" && l.kind === "polygon");
  const youtoActive = activeOverlays.includes("youto");
  const currentYear = new Date().getFullYear();
  const landPriceYears = Array.from({ length: currentYear - LAND_PRICE_START_YEAR + 1 }, (_, i) =>
    String(currentYear - i),
  );

  const overlayToggle = (l: LayerInfo) => (
    <label key={l.id} className="hazard-row">
      <input
        type="checkbox"
        checked={activeOverlays.includes(l.id)}
        onChange={() => onToggleOverlay(l.id)}
      />
      {l.group === "hazard" && (
        <span className="color-chip" style={{ background: HAZARD_COLORS[l.id] ?? "#888" }} />
      )}
      {l.label}
      {!l.wired && !mock && <span className="unwired-note">（未接続）</span>}
    </label>
  );

  return (
    <div className="layer-panel">
      <button className="close-button" onClick={onClose} aria-label="パネルを閉じる">
        ×
      </button>
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
        <h2>地価</h2>
        <label className="hazard-row">
          <input type="checkbox" checked={showLandPrice} onChange={onToggleLandPrice} />
          <span className="color-chip round" style={{ background: LAND_PRICE_COLOR }} />
          地価公示・地価調査
        </label>
        {showLandPrice && (
          <div className="period-row">
            <select
              value={landPriceYear}
              onChange={(e) => onLandPriceYearChange(e.target.value)}
              aria-label="地価の年"
            >
              {landPriceYears.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section>
        <h2>ハザード情報</h2>
        {hazardLayers.map(overlayToggle)}
      </section>

      <section>
        <h2>都市計画</h2>
        {cityplanLayers.map(overlayToggle)}
        {youtoActive && (
          <div className="youto-legend">
            {Object.entries(YOUTO_COLORS).map(([kind, color]) => (
              <div key={kind} className="legend-row">
                <span className="color-chip" style={{ background: color }} />
                {kind}
              </div>
            ))}
          </div>
        )}
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
