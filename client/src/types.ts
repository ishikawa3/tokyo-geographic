export interface LayerInfo {
  id: string;
  label: string;
  kind: "point" | "polygon";
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

export interface HazardHit {
  layerId: string;
  label: string;
  props: Record<string, unknown>;
}

export interface Selection {
  point: Record<string, unknown> | null;
  hazards: HazardHit[];
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
