export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

const MAX_LAT = 85.05112878;

export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(zoom)));
}

/** 経緯度 → Web Mercator XYZ タイル座標（OSM/Google方式） */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

/**
 * 表示範囲を覆うタイル座標一覧。
 * maxTiles を超える場合は先頭から打ち切る（異常なズームアウト時の保険）。
 */
export function boundsToTiles(
  west: number,
  south: number,
  east: number,
  north: number,
  z: number,
  maxTiles = 64,
): TileCoord[] {
  const nw = lngLatToTile(west, north, z);
  const se = lngLatToTile(east, south, z);
  const tiles: TileCoord[] = [];
  for (let y = nw.y; y <= se.y; y++) {
    for (let x = nw.x; x <= se.x; x++) {
      if (tiles.length >= maxTiles) return tiles;
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}
