/**
 * レイヤーレジストリ — reinfolib の API コード（XPT/XKT 番号）を記述してよいのは
 * このファイルだけ。フロントエンドは layerId（"flood" 等）しか知らない。
 *
 * apiCode: null のレイヤーは実モードでは 501 を返す（コード未確定）。
 * モックモードでは fixture を返すので、UI 実装はコード確定前に完成させられる。
 * XKT 系の番号は公式マニュアル https://www.reinfolib.mlit.go.jp/help/apiManual/
 * で確認してから埋めること（PLAN.md §3 参照）。
 */
export interface LayerDef {
  id: string;
  apiCode: string | null;
  label: string;
  kind: "point" | "polygon";
  /** UI上のセクション分け（価格系 / ハザード / 都市計画） */
  group: "price" | "hazard" | "cityplan";
  minZoom: number;
  maxZoom: number;
  /** 上流へ中継を許可するクエリパラメータのホワイトリスト */
  allowedParams: string[];
  /** モックモードで返す fixtures/ 内のファイル名 */
  fixture: string | null;
}

export const layers: LayerDef[] = [
  {
    id: "transaction-points",
    apiCode: "XPT001",
    label: "取引価格ポイント",
    kind: "point",
    group: "price",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: ["from", "to", "priceClassification"],
    fixture: "points.geojson",
  },
  {
    id: "land-price-points",
    apiCode: "XPT002",
    label: "地価公示・地価調査",
    kind: "point",
    group: "price",
    minZoom: 13,
    maxZoom: 15,
    allowedParams: ["year", "priceClassification"],
    fixture: "land-price-points.geojson",
  },
  {
    id: "youto",
    // 公式マニュアルでは XKT002 と思われるが未確認。確認後に埋めること（PLAN.md §3）
    apiCode: null,
    label: "用途地域",
    kind: "polygon",
    group: "cityplan",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: [],
    fixture: "youto.geojson",
  },
  {
    id: "flood",
    apiCode: null,
    label: "洪水浸水想定区域",
    kind: "polygon",
    group: "hazard",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: [],
    fixture: "hazard-flood.geojson",
  },
  {
    id: "landslide",
    apiCode: null,
    label: "土砂災害警戒区域",
    kind: "polygon",
    group: "hazard",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: [],
    fixture: "hazard-landslide.geojson",
  },
  {
    id: "tsunami",
    apiCode: null,
    label: "津波浸水想定",
    kind: "polygon",
    group: "hazard",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: [],
    fixture: "hazard-tsunami.geojson",
  },
  {
    id: "storm-surge",
    apiCode: null,
    label: "高潮浸水想定区域",
    kind: "polygon",
    group: "hazard",
    minZoom: 11,
    maxZoom: 15,
    allowedParams: [],
    fixture: "hazard-storm-surge.geojson",
  },
];

export function findLayer(id: string): LayerDef | undefined {
  return layers.find((l) => l.id === id);
}
