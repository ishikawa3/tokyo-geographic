import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCache } from "../src/cache.js";
import { createApp } from "../src/app.js";

// テストはモックモード（fixtures応答）で実行する
const savedEnv = { MOCK: process.env.MOCK, REINFOLIB_API_KEY: process.env.REINFOLIB_API_KEY };

beforeEach(() => {
  process.env.MOCK = "1";
  delete process.env.REINFOLIB_API_KEY;
  clearCache();
});

afterEach(() => {
  process.env.MOCK = savedEnv.MOCK;
  if (savedEnv.REINFOLIB_API_KEY === undefined) delete process.env.REINFOLIB_API_KEY;
  else process.env.REINFOLIB_API_KEY = savedEnv.REINFOLIB_API_KEY;
});

const app = createApp();

describe("GET /api/health", () => {
  it("mock: true を返す", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mock: true });
  });
});

describe("GET /api/layers", () => {
  it("レイヤー一覧を返す（apiCodeは露出しない）", async () => {
    const res = await app.request("/api/layers");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { layers: Array<Record<string, unknown>> };
    const ids = body.layers.map((l) => l.id);
    expect(ids).toContain("transaction-points");
    expect(ids).toContain("flood");
    for (const layer of body.layers) {
      expect(layer).not.toHaveProperty("apiCode");
      expect(typeof layer.wired).toBe("boolean");
    }
  });
});

describe("GET /api/cities", () => {
  it("東京都の62市区町村を返す", async () => {
    const res = await app.request("/api/cities");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cities: Array<{ id: string; name: string }> };
    expect(body.cities).toHaveLength(62);
    expect(body.cities[0]).toEqual({ id: "13101", name: "千代田区" });
  });
});

describe("GET /api/transactions", () => {
  it("year と city が必須", async () => {
    expect((await app.request("/api/transactions")).status).toBe(400);
    expect((await app.request("/api/transactions?year=2024")).status).toBe(400);
    expect((await app.request("/api/transactions?city=13101")).status).toBe(400);
    expect((await app.request("/api/transactions?year=24&city=13101")).status).toBe(400);
  });
  it("XIT001形式のデータを返す", async () => {
    const res = await app.request("/api/transactions?year=2024&city=13101");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, string>> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("TradePrice");
    expect(body.data[0]).toHaveProperty("Period");
  });
});

describe("GET /api/price-history", () => {
  it("city が必須", async () => {
    expect((await app.request("/api/price-history")).status).toBe(400);
  });
  it("四半期ごとの中央値を昇順で返す", async () => {
    const res = await app.request("/api/price-history?city=13101");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      city: string;
      points: Array<{ period: string; median: number; count: number }>;
    };
    expect(body.city).toBe("13101");
    expect(body.points.length).toBeGreaterThan(0);
    const periods = body.points.map((p) => p.period);
    expect([...periods].sort()).toEqual(periods);
    for (const p of body.points) {
      expect(p.median).toBeGreaterThan(0);
      expect(p.count).toBeGreaterThan(0);
    }
  });
  it("years の範囲外は 400", async () => {
    expect((await app.request("/api/price-history?city=13101&years=0")).status).toBe(400);
    expect((await app.request("/api/price-history?city=13101&years=11")).status).toBe(400);
  });
});

describe("GET /api/tiles/:layerId/:z/:x/:y", () => {
  it("GeoJSON FeatureCollection を返す", async () => {
    const res = await app.request("/api/tiles/transaction-points/13/7276/3225");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; features: unknown[] };
    expect(body.type).toBe("FeatureCollection");
    expect(body.features.length).toBeGreaterThan(0);
  });
  it("ハザードレイヤーもモックで返す", async () => {
    const res = await app.request("/api/tiles/flood/13/7276/3225");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe("FeatureCollection");
  });
  it("不明な layerId は 400", async () => {
    expect((await app.request("/api/tiles/nope/13/7276/3225")).status).toBe(400);
  });
  it("ズーム範囲外は 400", async () => {
    expect((await app.request("/api/tiles/transaction-points/9/100/100")).status).toBe(400);
    expect((await app.request("/api/tiles/transaction-points/16/100/100")).status).toBe(400);
  });
  it("x/y がズームレベルに対して範囲外なら 400", async () => {
    expect((await app.request("/api/tiles/transaction-points/11/2048/0")).status).toBe(400);
  });
  it("ホワイトリスト外のクエリは 400", async () => {
    const res = await app.request("/api/tiles/transaction-points/13/7276/3225?evil=1");
    expect(res.status).toBe(400);
  });
  it("許可されたクエリは通る", async () => {
    const res = await app.request("/api/tiles/transaction-points/13/7276/3225?from=20241&to=20244");
    expect(res.status).toBe(200);
  });
  it("実モードで apiCode 未確定レイヤーは 501", async () => {
    delete process.env.MOCK;
    process.env.REINFOLIB_API_KEY = "dummy-key-for-test";
    const res = await app.request("/api/tiles/flood/13/7276/3225");
    expect(res.status).toBe(501);
  });
});
