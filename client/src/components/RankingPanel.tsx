import { useState } from "react";
import { fetchJson } from "../lib/api";
import { formatPrice } from "../lib/format";
import { WARD_CENTERS } from "../lib/wardCenters";

interface RankingEntry {
  city: string;
  name: string;
  median: number;
  count: number;
}

interface RankingPanelProps {
  onFlyTo: (lngLat: [number, number]) => void;
}

export function RankingPanel({ onFlyTo }: RankingPanelProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RankingEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    // 初回展開時のみ取得（実モードでは上流を大量に叩くため遅い可能性がある）
    if (next && entries === null && !loading) {
      setLoading(true);
      setError(null);
      fetchJson<{ entries: RankingEntry[] }>("/api/ranking?quarters=4")
        .then((res) => setEntries(res.entries))
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }

  return (
    <div className="ranking-panel">
      <button className="ranking-header" onClick={toggle} aria-expanded={open}>
        23区 価格ランキング（直近4四半期） {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="ranking-body">
          {loading && <p className="muted">集計中…（初回は時間がかかることがあります）</p>}
          {error && <p className="error-text">取得に失敗しました: {error}</p>}
          {entries && entries.length === 0 && <p className="muted">データがありません</p>}
          {entries &&
            entries.map((e, i) => {
              const center = WARD_CENTERS[e.city];
              return (
                <button
                  key={e.city}
                  className="ranking-row"
                  onClick={() => center && onFlyTo(center)}
                  title={`${e.name}へ移動（${e.count}件）`}
                >
                  <span className="ranking-rank">{i + 1}</span>
                  <span className="ranking-name">{e.name}</span>
                  <span className="ranking-median">{formatPrice(e.median)}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
