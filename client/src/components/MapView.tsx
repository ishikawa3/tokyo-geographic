import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { HAZARD_COLORS, PRICE_BINS, PRICE_COLORS } from "../lib/colors";
import { boundsToTiles, clampZoom } from "../lib/tiles";
import { TileLoader } from "../lib/tileLoader";
import type { LayerInfo, PeriodRange, PointDisplayMode, Selection } from "../types";

const POINTS_LAYER_ID = "transaction-points";
const CIRCLE_LAYER = "points-circle";
const HEATMAP_LAYER = "points-heat";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const MOVE_DEBOUNCE_MS = 300;

interface MapViewProps {
  layers: LayerInfo[];
  pointMode: PointDisplayMode;
  activeHazards: string[];
  period: PeriodRange;
  onSelect: (sel: Selection | null) => void;
  onStatus: (msg: string | null) => void;
}

export function MapView({ layers, pointMode, activeHazards, period, onSelect, onStatus }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const pointsLoader = useRef(new TileLoader());
  const hazardLoader = useRef(new TileLoader());
  // 各レイヤーの読み込み世代。古いレスポンスで setData しないためのトークン
  const loadTokens = useRef(new Map<string, number>());

  // イベントハンドラは一度だけ登録するので、最新の props は ref 経由で参照する
  const stateRef = useRef({ layers, pointMode, activeHazards, period, onSelect, onStatus });
  stateRef.current = { layers, pointMode, activeHazards, period, onSelect, onStatus };

  const pointLayer = layers.find((l) => l.id === POINTS_LAYER_ID);

  function setSourceData(map: maplibregl.Map, sourceId: string, data: unknown) {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as never);
  }

  async function reloadPoints(map: maplibregl.Map) {
    const { layers, period, onStatus } = stateRef.current;
    const info = layers.find((l) => l.id === POINTS_LAYER_ID);
    if (!info) return;
    const token = (loadTokens.current.get(POINTS_LAYER_ID) ?? 0) + 1;
    loadTokens.current.set(POINTS_LAYER_ID, token);

    if (Math.floor(map.getZoom()) < info.minZoom) {
      setSourceData(map, POINTS_LAYER_ID, EMPTY_FC);
      onStatus(`ズーム${info.minZoom}以上で取引ポイントが表示されます（ズームインしてください）`);
      return;
    }
    const z = clampZoom(map.getZoom(), info.minZoom, info.maxZoom);
    const b = map.getBounds();
    const tiles = boundsToTiles(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z);
    try {
      const fc = await pointsLoader.current.load(
        POINTS_LAYER_ID,
        tiles,
        `from=${period.from}&to=${period.to}`,
      );
      if (loadTokens.current.get(POINTS_LAYER_ID) !== token) return;
      setSourceData(map, POINTS_LAYER_ID, fc);
      onStatus(null);
    } catch (e) {
      if (loadTokens.current.get(POINTS_LAYER_ID) !== token) return;
      onStatus(`取引データの取得に失敗しました: ${(e as Error).message}`);
    }
  }

  async function reloadHazard(map: maplibregl.Map, layerId: string) {
    const { layers, onStatus } = stateRef.current;
    const info = layers.find((l) => l.id === layerId);
    if (!info) return;
    const token = (loadTokens.current.get(layerId) ?? 0) + 1;
    loadTokens.current.set(layerId, token);

    if (Math.floor(map.getZoom()) < info.minZoom) {
      setSourceData(map, `hazard-src-${layerId}`, EMPTY_FC);
      return;
    }
    const z = clampZoom(map.getZoom(), info.minZoom, info.maxZoom);
    const b = map.getBounds();
    const tiles = boundsToTiles(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z);
    try {
      const fc = await hazardLoader.current.load(layerId, tiles, "");
      if (loadTokens.current.get(layerId) !== token) return;
      setSourceData(map, `hazard-src-${layerId}`, fc);
    } catch (e) {
      if (loadTokens.current.get(layerId) !== token) return;
      onStatus(`${info.label}の取得に失敗しました: ${(e as Error).message}`);
    }
  }

  function reloadActive(map: maplibregl.Map) {
    void reloadPoints(map);
    for (const id of stateRef.current.activeHazards) {
      void reloadHazard(map, id);
    }
  }

  // 地図の初期化（マウント時に一度だけ）
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [139.767, 35.681], // 東京駅
      zoom: 13,
      style: {
        version: 8,
        sources: {
          gsi: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 18,
            attribution:
              '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a> | 出典: <a href="https://www.reinfolib.mlit.go.jp/" target="_blank" rel="noreferrer">不動産情報ライブラリ（国土交通省）</a>',
          },
        },
        layers: [{ id: "gsi", type: "raster", source: "gsi" }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource(POINTS_LAYER_ID, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: HEATMAP_LAYER,
        type: "heatmap",
        source: POINTS_LAYER_ID,
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "TradePrice"], 0],
            0,
            0.2,
            500_000_000,
            1,
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 12, 15, 28],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(109,167,236,0)",
            0.3,
            PRICE_COLORS[0],
            0.55,
            PRICE_COLORS[1],
            0.75,
            PRICE_COLORS[2],
            0.9,
            PRICE_COLORS[3],
            1,
            PRICE_COLORS[4],
          ],
          "heatmap-opacity": 0.75,
        },
      });
      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: POINTS_LAYER_ID,
        paint: {
          "circle-color": [
            "step",
            ["to-number", ["get", "TradePrice"], 0],
            PRICE_COLORS[0],
            PRICE_BINS[0],
            PRICE_COLORS[1],
            PRICE_BINS[1],
            PRICE_COLORS[2],
            PRICE_BINS[2],
            PRICE_COLORS[3],
            PRICE_BINS[3],
            PRICE_COLORS[4],
          ],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 8],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });
      setMapReady(true);
      reloadActive(map);
    });

    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    map.on("moveend", () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => reloadActive(map), MOVE_DEBOUNCE_MS);
    });

    map.on("click", (e) => {
      const { pointMode, activeHazards, layers, onSelect } = stateRef.current;
      const queryLayers: string[] = [];
      if (pointMode === "points" && map.getLayer(CIRCLE_LAYER)) queryLayers.push(CIRCLE_LAYER);
      for (const id of activeHazards) {
        if (map.getLayer(`hazard-${id}`)) queryLayers.push(`hazard-${id}`);
      }
      const feats = queryLayers.length
        ? map.queryRenderedFeatures(e.point, { layers: queryLayers })
        : [];
      const pointFeat = feats.find((f) => f.layer.id === CIRCLE_LAYER);
      const seen = new Set<string>();
      const hazards = feats
        .filter((f) => f.layer.id.startsWith("hazard-"))
        .map((f) => {
          const layerId = f.layer.id.slice("hazard-".length);
          return {
            layerId,
            label: layers.find((l) => l.id === layerId)?.label ?? layerId,
            props: { ...(f.properties ?? {}) },
          };
        })
        .filter((h) => {
          const key = h.layerId + JSON.stringify(h.props);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (!pointFeat && hazards.length === 0) {
        onSelect(null);
        return;
      }
      onSelect({
        point: pointFeat ? { ...(pointFeat.properties ?? {}) } : null,
        hazards,
        lngLat: [e.lngLat.lng, e.lngLat.lat],
      });
    });

    map.on("mouseenter", CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      clearTimeout(moveTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 期間変更 → ポイントのキャッシュを破棄して再取得
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    pointsLoader.current.clear();
    void reloadPoints(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, period.from, period.to]);

  // 表示モード切替（ポイント/ヒートマップ/非表示）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(CIRCLE_LAYER, "visibility", pointMode === "points" ? "visible" : "none");
    map.setLayoutProperty(HEATMAP_LAYER, "visibility", pointMode === "heatmap" ? "visible" : "none");
  }, [mapReady, pointMode]);

  // ハザードレイヤーのトグル
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const info of layers.filter((l) => l.kind === "polygon")) {
      const active = activeHazards.includes(info.id);
      const layerId = `hazard-${info.id}`;
      const sourceId = `hazard-src-${info.id}`;
      if (!map.getSource(sourceId)) {
        if (!active) continue;
        map.addSource(sourceId, { type: "geojson", data: EMPTY_FC });
        const color = HAZARD_COLORS[info.id] ?? "#888888";
        // ポイントより下、ベース地図より上に挿入
        map.addLayer(
          {
            id: layerId,
            type: "fill",
            source: sourceId,
            paint: { "fill-color": color, "fill-opacity": 0.35, "fill-outline-color": color },
          },
          map.getLayer(HEATMAP_LAYER) ? HEATMAP_LAYER : undefined,
        );
      }
      map.setLayoutProperty(layerId, "visibility", active ? "visible" : "none");
      if (active) void reloadHazard(map, info.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeHazards, layers]);

  if (!pointLayer) return null;
  return <div ref={containerRef} className="map-container" />;
}
