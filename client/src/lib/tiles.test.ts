import { describe, expect, it } from "vitest";
import { boundsToTiles, clampZoom, lngLatToTile } from "./tiles";

describe("clampZoom", () => {
  it("範囲内は floor する", () => {
    expect(clampZoom(13.7, 11, 15)).toBe(13);
  });
  it("範囲外はクランプする", () => {
    expect(clampZoom(9.2, 11, 15)).toBe(11);
    expect(clampZoom(17, 11, 15)).toBe(15);
  });
});

describe("lngLatToTile", () => {
  it("z=0 は常に (0,0)", () => {
    expect(lngLatToTile(139.767, 35.681, 0)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(-179, -80, 0)).toEqual({ x: 0, y: 0 });
  });
  it("原点 (0,0) は z=1 でタイル (1,1)", () => {
    expect(lngLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });
  it("東京駅は z=12 でタイル (3638, 1612)", () => {
    expect(lngLatToTile(139.767, 35.681, 12)).toEqual({ x: 3638, y: 1612 });
  });
  it("経度→x は増加、緯度→y は減少（北ほど小さい）", () => {
    const z = 12;
    const a = lngLatToTile(139.0, 35.681, z);
    const b = lngLatToTile(140.0, 35.681, z);
    expect(b.x).toBeGreaterThan(a.x);
    const south = lngLatToTile(139.767, 35.0, z);
    const north = lngLatToTile(139.767, 36.0, z);
    expect(north.y).toBeLessThan(south.y);
  });
  it("極端な座標でも範囲内に収まる", () => {
    const { x, y } = lngLatToTile(180, 90, 4);
    expect(x).toBeLessThanOrEqual(15);
    expect(y).toBeGreaterThanOrEqual(0);
  });
});

describe("boundsToTiles", () => {
  it("1タイル内に収まる範囲は1タイル", () => {
    const tiles = boundsToTiles(139.766, 35.68, 139.768, 35.682, 12);
    expect(tiles).toEqual([{ z: 12, x: 3638, y: 1612 }]);
  });
  it("複数タイルにまたがる範囲は全タイルを列挙する", () => {
    // 東京駅周辺 z14 で 2x2 程度の範囲
    const tiles = boundsToTiles(139.75, 35.67, 139.79, 35.7, 14);
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    const keys = new Set(tiles.map((t) => `${t.x}/${t.y}`));
    expect(keys.size).toBe(tiles.length); // 重複なし
  });
  it("maxTiles で打ち切る", () => {
    const tiles = boundsToTiles(135, 33, 142, 38, 15, 64);
    expect(tiles.length).toBe(64);
  });
});
