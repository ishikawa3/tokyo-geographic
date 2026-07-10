import { usePriceHistory } from "../hooks/usePriceHistory";
import { HAZARD_COLORS, YOUTO_COLORS, YOUTO_PROP_KEY } from "../lib/colors";
import { formatPrice, parseNumeric, PROP_LABELS, PROP_LABELS_LAND_PRICE } from "../lib/format";
import type { City, SelectedPoint, Selection } from "../types";
import { PriceChart } from "./PriceChart";

interface DetailPanelProps {
  selection: Selection;
  cities: City[];
  onClose: () => void;
}

/** ポイントのプロパティから市区町村コードを解決する */
function resolveCityCode(point: SelectedPoint | null, cities: City[]): string | null {
  if (!point) return null;
  const code = point.props.MunicipalityCode;
  if (typeof code === "string" && /^\d{5}$/.test(code)) return code;
  const name = point.props.Municipality;
  if (typeof name === "string") {
    const hit = cities.find((c) => c.name === name);
    if (hit) return hit.id;
  }
  return null;
}

/** 取引ポイントの詳細（価格見出し + ラベル表） */
function TransactionDetail({ props }: { props: Record<string, unknown> }) {
  const price = parseNumeric(props.TradePrice);
  return (
    <>
      <h2 className="detail-price">{price !== null ? formatPrice(price) : "価格非公開"}</h2>
      <table className="detail-table">
        <tbody>
          {PROP_LABELS.map(([key, label]) => {
            const value = props[key];
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
  );
}

/**
 * 地価公示・地価調査ポイントの詳細。
 * 実APIのプロパティ名が未確認のため、既知キーはラベル付き、未知キーは汎用表示にフォールバック。
 */
function LandPriceDetail({ props }: { props: Record<string, unknown> }) {
  const unitPrice = parseNumeric(props.TargetYearPrice);
  const knownKeys = new Set([
    "TargetYearPrice",
    "MunicipalityCode",
    ...PROP_LABELS_LAND_PRICE.map(([k]) => k),
  ]);
  const otherEntries = Object.entries(props).filter(
    ([k, v]) => !knownKeys.has(k) && v != null && v !== "" && typeof v !== "object",
  );
  return (
    <>
      <h2 className="detail-price">
        {unitPrice !== null ? `${formatPrice(unitPrice)}/㎡` : "地価情報"}
      </h2>
      <table className="detail-table">
        <tbody>
          {PROP_LABELS_LAND_PRICE.map(([key, label]) => {
            const value = props[key];
            if (value == null || value === "") return null;
            return (
              <tr key={key}>
                <th>{label}</th>
                <td>{String(value)}</td>
              </tr>
            );
          })}
          {otherEntries.map(([key, value]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function DetailPanel({ selection, cities, onClose }: DetailPanelProps) {
  const { point, overlays } = selection;
  const cityCode = resolveCityCode(point, cities);
  const history = usePriceHistory(cityCode);
  const cityName = cities.find((c) => c.id === cityCode)?.name;

  return (
    <div className="detail-panel">
      <button className="close-button" onClick={onClose} aria-label="閉じる">
        ×
      </button>

      {point ? (
        point.layerId === "land-price-points" ? (
          <LandPriceDetail props={point.props} />
        ) : (
          <TransactionDetail props={point.props} />
        )
      ) : (
        <h2 className="detail-heading">地点情報</h2>
      )}

      <section className="hazard-section">
        <h3>この地点の重ね合わせ情報</h3>
        {overlays.length > 0 ? (
          <div className="badge-list">
            {overlays.map((h, i) => {
              const detail = h.props.label ?? h.props[YOUTO_PROP_KEY];
              const color =
                h.layerId === "youto"
                  ? (typeof detail === "string" && YOUTO_COLORS[detail]) || "#888"
                  : (HAZARD_COLORS[h.layerId] ?? "#888");
              return (
                <span
                  key={`${h.layerId}-${i}`}
                  className="hazard-badge"
                  style={{ borderColor: color }}
                >
                  <span className="color-chip" style={{ background: color }} />
                  {h.layerId === "youto" ? "" : "⚠ "}
                  {h.label}
                  {typeof detail === "string" && `：${detail}`}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="muted">表示中のハザード・都市計画区域には該当しません</p>
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
