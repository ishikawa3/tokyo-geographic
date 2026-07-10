import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import {
  HAZARD_COLORS,
  LAND_PRICE_COLOR,
  PRICE_BINS,
  PRICE_COLORS,
  YOUTO_COLORS,
  YOUTO_FALLBACK_COLOR,
  YOUTO_PROP_KEY,
} from "../lib/colors";
import { boundsToTiles, clampZoom } from "../lib/tiles";
import { TileLoader } from "../lib/tileLoader";
import type { LayerInfo, PeriodRange, PointDisplayMode, Selection } from "../types";

const POINTS_LAYER_ID = "transaction-points";
const LANDPRICE_LAYER_ID = "land-price-points";
const CIRCLE_LAYER = "points-circle";
const HEATMAP_LAYER = "points-heat";
const LANDPRICE_CIRCLE_LAYER = "landprice-circle";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const MOVE_DEBOUNCE_MS = 300;

export interface MapApi {
  flyTo: (lngLat: [number, number], zoom?: number) => void;
}

interface MapViewProps {
  layers: LayerInfo[];
  pointMode: PointDisplayMode;
  showLandPrice: boolean;
  landPriceYear: string;
  activeOverlays: string[];
  period: PeriodRange;
  onSelect: (sel: Selection | null) => void;
  onStatus: (msg: string | null) => void;
  onMapReady?: (api: MapApi) => void;
}

export function MapView({
  layers,
  pointMode,
  showLandPrice,
  landPriceYear,
  activeOverlays,
  period,
  onSelect,
  onStatus,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const pointsLoader = useRef(new TileLoader());
  const overlayLoader = useRef(new TileLoader());
  // 各レイヤーの読み込み世代。古いレスポンスで setData しないためのトークン
  const loadTokens = useRef(new Map<string, number>());
  // レイヤーごとのステータスメッセージ（ズームヒント・エラー）。先勝ちで1つ表示する
  const layerStatus = useRef(new Map<string, string>());

  // イベントハンドラは一度だけ登録するので、最新の props は ref 経由で参照する
  const stateRef = useRef({
    layers,
    pointMode,
    showLandPrice,
    landPriceYear,
    activeOverlays,
    period,
    onSelect,
    onStatus,
  });
  stateRef.current = {
    layers,
    pointMode,
    showLandPrice,
    landPriceYear,
    activeOverlays,
    period,
    onSelect,
    onStatus,
  };

  function setLayerStatus(layerId: string, msg: string | null) {
    if (msg === null) layerStatus.current.delete(layerId);
    else layerStatus.current.set(layerId, msg);
    const first = layerStatus.current.values().next();
    stateRef.current.onStatus(first.done ? null : first.value);
  }

  function setSourceData(map: maplibregl.Map, sourceId: string, data: unknown) {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as never);
  }

  /** ポイントレイヤーごとのタイルAPIクエリ。null = 現在非アクティブ */
  function getPointQuery(layerId: string): string | null {
    const { period, showLandPrice, landPriceYear } = stateRef.current;
    if (layerId === POINTS_LAYER_ID) return `from=${period.from}&to=${period.to}`;
    if (layerId === LANDPRICE_LAYER_ID) return showLandPrice ? `year=${landPriceYear}` : null;
    return null;
  }

  async function reloadPointLayer(map: maplibregl.Map, layerId: string) {
    const info = stateRef.current.layers.find((l) => l.id === layerId);
    if (!info) return;
    const query = getPointQuery(layerId);
    if (query === null) {
      setLayerStatus(layerId, null);
      return;
    }
    const token = (loadTokens.current.get(layerId) ?? 0) + 1;
    loadTokens.current.set(layerId, token);

    if (Math.floor(map.getZoom()) < info.minZoom) {
      setSourceData(map, layerId, EMPTY_FC);
      setLayerStatus(layerId, `ズーム${info.minZoom}以上で${info.label}が表示されます`);
      return;
    }
    const z = clampZoom(map.getZoom(), info.minZoom, info.maxZoom);
    const b = map.getBounds();
    const tiles = boundsToTiles(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z);
    try {
      const fc = await pointsLoader.current.load(layerId, tiles, query);
      if (loadTokens.current.get(layerId) !== token) return;
      setSourceData(map, layerId, fc);
      setLayerStatus(layerId, null);
    } catch (e) {
      if (loadTokens.current.get(layerId) !== token) return;
      setLayerStatus(layerId, `${info.label}の取得に失敗しました: ${(e as Error).message}`);
    }
  }

  async function reloadOverlay(map: maplibregl.Map, layerId: string) {
    const info = stateRef.current.layers.find((l) => l.id === layerId);
    if (!info) return;
    const token = (loadTokens.current.get(layerId) ?? 0) + 1;
    loadTokens.current.set(layerId, token);

    if (Math.floor(map.getZoom()) < info.minZoom) {
      setSourceData(map, `overlay-src-${layerId}`, EMPTY_FC);
      return;
    }
    const z = clampZoom(map.getZoom(), info.minZoom, info.maxZoom);
    const b = map.getBounds();
    const tiles = boundsToTiles(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z);
    try {
      const fc = await overlayLoader.current.load(layerId, tiles, "");
      if (loadTokens.current.get(layerId) !== token) return;
      setSourceData(map, `overlay-src-${layerId}`, fc);
    } catch (e) {
      if (loadTokens.current.get(layerId) !== token) return;
      setLayerStatus(layerId, `${info.label}の取得に失敗しました: ${(e as Error).message}`);
    }
  }

  function reloadActive(map: maplibregl.Map) {
    void reloadPointLayer(map, POINTS_LAYER_ID);
    void reloadPointLayer(map, LANDPRICE_LAYER_ID);
    for (const id of stateRef.current.activeOverlays) {
      void reloadOverlay(map, id);
    }
  }

  /** ポリゴンレイヤーの塗り。用途地域は種別ごとのデータ駆動色、それ以外は単色 */
  function overlayPaint(layerId: string): maplibregl.FillLayerSpecification["paint"] {
    if (layerId === "youto") {
      const matchExpr: unknown[] = ["match", ["get", YOUTO_PROP_KEY]];
      for (const [kind, color] of Object.entries(YOUTO_COLORS)) matchExpr.push(kind, color);
      matchExpr.push(YOUTO_FALLBACK_COLOR);
      const expr = matchExpr as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;
      return { "fill-color": expr, "fill-opacity": 0.3, "fill-outline-color": expr };
    }
    const color = HAZARD_COLORS[layerId] ?? "#888888";
    return { "fill-color": color, "fill-opacity": 0.35, "fill-outline-color": color };
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
      map.addSource(LANDPRICE_LAYER_ID, { type: "geojson", data: EMPTY_FC });
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
      // 地価公示ポイント: 取引ポイント（青系）と見分けるため黄+濃い縁取り
      map.addLayer({
        id: LANDPRICE_CIRCLE_LAYER,
        type: "circle",
        source: LANDPRICE_LAYER_ID,
        layout: { visibility: "none" },
        paint: {
          "circle-color": LAND_PRICE_COLOR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 5, 15, 9],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0b0b0b",
          "circle-opacity": 0.95,
        },
      });
      setMapReady(true);
      reloadActive(map);
      onMapReady?.({
        flyTo: (lngLat, zoom = 13) => map.flyTo({ center: lngLat, zoom }),
      });
    });

    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    map.on("moveend", () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => reloadActive(map), MOVE_DEBOUNCE_MS);
    });

    map.on("click", (e) => {
      const { pointMode, showLandPrice, activeOverlays, layers, onSelect } = stateRef.current;
      const queryLayers: string[] = [];
      if (pointMode === "points" && map.getLayer(CIRCLE_LAYER)) queryLayers.push(CIRCLE_LAYER);
      if (showLandPrice && map.getLayer(LANDPRICE_CIRCLE_LAYER))
        queryLayers.push(LANDPRICE_CIRCLE_LAYER);
      for (const id of activeOverlays) {
        if (map.getLayer(`overlay-${id}`)) queryLayers.push(`overlay-${id}`);
      }
      const feats = queryLayers.length
        ? map.queryRenderedFeatures(e.point, { layers: queryLayers })
        : [];
      const pointFeat = feats.find(
        (f) => f.layer.id === CIRCLE_LAYER || f.layer.id === LANDPRICE_CIRCLE_LAYER,
      );
      const seen = new Set<string>();
      const overlays = feats
        .filter((f) => f.layer.id.startsWith("overlay-"))
        .map((f) => {
          const layerId = f.layer.id.slice("overlay-".length);
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
      if (!pointFeat && overlays.length === 0) {
        onSelect(null);
        return;
      }
      onSelect({
        point: pointFeat
          ? {
              layerId:
                pointFeat.layer.id === LANDPRICE_CIRCLE_LAYER
                  ? LANDPRICE_LAYER_ID
                  : POINTS_LAYER_ID,
              props: { ...(pointFeat.properties ?? {}) },
            }
          : null,
        overlays,
        lngLat: [e.lngLat.lng, e.lngLat.lat],
      });
    });

    for (const hoverLayer of [CIRCLE_LAYER, LANDPRICE_CIRCLE_LAYER]) {
      map.on("mouseenter", hoverLayer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", hoverLayer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      clearTimeout(moveTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 期間変更 → 取引ポイントを再取得（キャッシュキーに期間が含まれるためクリア不要）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    void reloadPointLayer(map, POINTS_LAYER_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, period.from, period.to]);

  // 表示モード切替（ポイント/ヒートマップ/非表示）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(CIRCLE_LAYER, "visibility", pointMode === "points" ? "visible" : "none");
    map.setLayoutProperty(HEATMAP_LAYER, "visibility", pointMode === "heatmap" ? "visible" : "none");
  }, [mapReady, pointMode]);

  // 地価公示ポイントのトグル・年変更
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(
      LANDPRICE_CIRCLE_LAYER,
      "visibility",
      showLandPrice ? "visible" : "none",
    );
    if (showLandPrice) void reloadPointLayer(map, LANDPRICE_LAYER_ID);
    else setLayerStatus(LANDPRICE_LAYER_ID, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showLandPrice, landPriceYear]);

  // ポリゴンオーバーレイ（ハザード・用途地域）のトグル
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const info of layers.filter((l) => l.kind === "polygon")) {
      const active = activeOverlays.includes(info.id);
      const layerId = `overlay-${info.id}`;
      const sourceId = `overlay-src-${info.id}`;
      if (!map.getSource(sourceId)) {
        if (!active) continue;
        map.addSource(sourceId, { type: "geojson", data: EMPTY_FC });
        // ポイントより下、ベース地図より上に挿入
        map.addLayer(
          { id: layerId, type: "fill", source: sourceId, paint: overlayPaint(info.id) },
          map.getLayer(HEATMAP_LAYER) ? HEATMAP_LAYER : undefined,
        );
      }
      map.setLayoutProperty(layerId, "visibility", active ? "visible" : "none");
      if (active) void reloadOverlay(map, info.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeOverlays, layers]);

  return <div ref={containerRef} className="map-container" />;
}
