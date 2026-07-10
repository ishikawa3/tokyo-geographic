import { useEffect, useState } from "react";
import { DetailPanel } from "./components/DetailPanel";
import { LayerPanel } from "./components/LayerPanel";
import { MapView, type MapApi } from "./components/MapView";
import { RankingPanel } from "./components/RankingPanel";
import { fetchJson } from "./lib/api";
import { quartersAgo } from "./lib/format";
import type { City, LayerInfo, PeriodRange, PointDisplayMode, Selection } from "./types";

export default function App() {
  const [layers, setLayers] = useState<LayerInfo[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [mock, setMock] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapApi, setMapApi] = useState<MapApi | null>(null);

  const [pointMode, setPointMode] = useState<PointDisplayMode>("points");
  const [showLandPrice, setShowLandPrice] = useState(false);
  const [landPriceYear, setLandPriceYear] = useState(String(new Date().getFullYear() - 1));
  const [activeOverlays, setActiveOverlays] = useState<string[]>([]);
  const [period, setPeriod] = useState<PeriodRange>({ from: quartersAgo(4), to: quartersAgo(0) });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // モバイルではレイヤーパネルを初期状態で閉じる
  const [panelOpen, setPanelOpen] = useState(
    () => window.matchMedia("(min-width: 641px)").matches,
  );

  useEffect(() => {
    Promise.all([
      fetchJson<{ layers: LayerInfo[] }>("/api/layers"),
      fetchJson<{ cities: City[] }>("/api/cities"),
      fetchJson<{ ok: boolean; mock: boolean }>("/api/health"),
    ])
      .then(([layersRes, citiesRes, health]) => {
        setLayers(layersRes.layers);
        setCities(citiesRes.cities);
        setMock(health.mock);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  if (loadError) {
    return (
      <div className="fullscreen-message">
        <p>サーバーに接続できません: {loadError}</p>
        <p className="muted">
          `npm run dev` でサーバー（ポート8787）が起動しているか確認してください。
        </p>
      </div>
    );
  }
  if (!layers) {
    return <div className="fullscreen-message">読み込み中…</div>;
  }

  return (
    <div className="app">
      <MapView
        layers={layers}
        pointMode={pointMode}
        showLandPrice={showLandPrice}
        landPriceYear={landPriceYear}
        activeOverlays={activeOverlays}
        period={period}
        onSelect={setSelection}
        onStatus={setStatus}
        onMapReady={setMapApi}
      />
      {panelOpen ? (
        <LayerPanel
          layers={layers}
          pointMode={pointMode}
          onPointModeChange={setPointMode}
          showLandPrice={showLandPrice}
          onToggleLandPrice={() => setShowLandPrice((v) => !v)}
          landPriceYear={landPriceYear}
          onLandPriceYearChange={setLandPriceYear}
          activeOverlays={activeOverlays}
          onToggleOverlay={(id) =>
            setActiveOverlays((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          period={period}
          onPeriodChange={setPeriod}
          mock={mock}
          onClose={() => setPanelOpen(false)}
        />
      ) : (
        <button className="panel-toggle" onClick={() => setPanelOpen(true)}>
          ☰ レイヤー
        </button>
      )}
      <RankingPanel onFlyTo={(lngLat) => mapApi?.flyTo(lngLat)} />
      {status && <div className="status-bar">{status}</div>}
      {selection && (
        <DetailPanel selection={selection} cities={cities} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}
