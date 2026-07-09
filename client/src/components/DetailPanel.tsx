import { usePriceHistory } from "../hooks/usePriceHistory";
import { HAZARD_COLORS } from "../lib/colors";
import { formatPrice, parseNumeric, PROP_LABELS } from "../lib/format";
import type { City, Selection } from "../types";
import { PriceChart } from "./PriceChart";

interface DetailPanelProps {
  selection: Selection;
  cities: City[];
  onClose: () => void;
}

/** ポイントのプロパティから市区町村コードを解決する */
function resolveCityCode(point: Record<string, unknown> | null, cities: City[]): string | null {
  if (!point) return null;
  const code = point.MunicipalityCode;
  if (typeof code === "string" && /^\d{5}$/.test(code)) return code;
  const name = point.Municipality;
  if (typeof name === "string") {
    const hit = cities.find((c) => c.name === name);
    if (hit) return hit.id;
  }
  return null;
}

export function DetailPanel({ selection, cities, onClose }: DetailPanelProps) {
  const { point, hazards } = selection;
  const cityCode = resolveCityCode(point, cities);
  const history = usePriceHistory(cityCode);
  const cityName = cities.find((c) => c.id === cityCode)?.name;
  const price = parseNumeric(point?.TradePrice);

  return (
    <div className="detail-panel">
      <button className="close-button" onClick={onClose} aria-label="閉じる">
        ×
      </button>

      {point ? (
        <>
          <h2 className="detail-price">{price !== null ? formatPrice(price) : "価格非公開"}</h2>
          <table className="detail-table">
            <tbody>
              {PROP_LABELS.map(([key, label]) => {
                const value = point[key];
                if (value == null || value === "") return null;
                const display =
                  key === "UnitPrice" && parseNumeric(value) !== null
                    ? `${formatPrice(parseNumeric(value)!)}/㎡`
                    : String(value);
                return (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>{display}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <h2 className="detail-heading">地点情報</h2>
      )}

      <section className="hazard-section">
        <h3>この地点のハザード情報</h3>
        {hazards.length > 0 ? (
          <div className="badge-list">
            {hazards.map((h, i) => (
              <span
                key={`${h.layerId}-${i}`}
                className="hazard-badge"
                style={{ borderColor: HAZARD_COLORS[h.layerId] ?? "#888" }}
              >
                <span
                  className="color-chip"
                  style={{ background: HAZARD_COLORS[h.layerId] ?? "#888" }}
                />
                ⚠ {h.label}
                {typeof h.props.label === "string" && `：${h.props.label}`}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">表示中のハザード区域には該当しません</p>
        )}
      </section>

      {cityCode && (
        <section className="chart-section">
          <h3>{cityName ?? cityCode} の価格推移（四半期中央値）</h3>
          {history.loading && <div className="chart-skeleton" aria-label="読み込み中" />}
          {history.error && <p className="error-text">取得に失敗しました: {history.error}</p>}
          {history.data && <PriceChart points={history.data} />}
        </section>
      )}
    </div>
  );
}
