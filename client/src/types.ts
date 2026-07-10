export interface LayerInfo {
  id: string;
  label: string;
  kind: "point" | "polygon";
  /** UI上のセクション分け */
  group: "price" | "hazard" | "cityplan";
  minZoom: number;
  maxZoom: number;
  /** 実APIに接続済みか（false = モックのみで動作） */
  wired: boolean;
}

export type PointDisplayMode = "points" | "heatmap" | "off";

/** 四半期は reinfolib タイルAPIと同じ YYYYN 形式（例: "20241" = 2024Q1） */
export interface PeriodRange {
  from: string;
  to: string;
}

/** クリック地点に重なっていたポリゴンレイヤー（ハザード・用途地域） */
export interface OverlayHit {
  layerId: string;
  label: string;
  props: Record<string, unknown>;
}

export interface SelectedPoint {
  /** どのポイントレイヤー由来か（"transaction-points" | "land-price-points"） */
  layerId: string;
  props: Record<string, unknown>;
}

export interface Selection {
  point: SelectedPoint | null;
  overlays: OverlayHit[];
  lngLat: [number, number];
}

export interface HistoryPoint {
  period: string;
  median: number;
  count: number;
}

export interface City {
  id: string;
  name: string;
}
