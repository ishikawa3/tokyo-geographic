import type { Feature, FeatureCollection } from "geojson";
import { fetchJson } from "./api";
import type { TileCoord } from "./tiles";

const CONCURRENCY = 4;

/**
 * タイル単位のGeoJSONを取得・キャッシュし、マージした FeatureCollection を返す。
 * モックは全タイルで同じ内容を返すため（実APIでもタイル境界で重複し得るため）、
 * geometry+properties でデデュープする。
 */
export class TileLoader {
  private cache = new Map<string, FeatureCollection>();

  clear(): void {
    this.cache.clear();
  }

  async load(layerId: string, tiles: TileCoord[], query: string): Promise<FeatureCollection> {
    const keys = tiles.map((t) => `${layerId}/${t.z}/${t.x}/${t.y}?${query}`);
    const missing = tiles
      .map((t, i) => ({ tile: t, key: keys[i] }))
      .filter(({ key }) => !this.cache.has(key));

    let next = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, missing.length) }, async () => {
      while (next < missing.length) {
        const { tile, key } = missing[next++];
        const url = `/api/tiles/${layerId}/${tile.z}/${tile.x}/${tile.y}${query ? `?${query}` : ""}`;
        const fc = await fetchJson<FeatureCollection>(url);
        this.cache.set(key, fc);
      }
    });
    await Promise.all(workers);

    const seen = new Set<string>();
    const features: Feature[] = [];
    for (const key of keys) {
      const fc = this.cache.get(key);
      if (!fc?.features) continue;
      for (const f of fc.features) {
        const id = JSON.stringify(f.geometry) + JSON.stringify(f.properties ?? {});
        if (seen.has(id)) continue;
        seen.add(id);
        features.push(f);
      }
    }
    return { type: "FeatureCollection", features };
  }
}
