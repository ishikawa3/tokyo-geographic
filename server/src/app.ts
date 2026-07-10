import { Hono } from "hono";
import { getCached, setCached } from "./cache.js";
import { findLayer, layers } from "./config/layers.js";
import { aggregateByPeriod, medianOfRecentQuarters, type PeriodStat } from "./lib/stats.js";
import { isMockMode, loadFixture } from "./mock.js";
import { fetchReinfolib, mapWithConcurrency, UpstreamError } from "./reinfolib.js";

const TOKYO_PREF_CODE = "13";
const DAY_MS = 24 * 60 * 60 * 1000;

interface Xit001Response {
  status?: string;
  data?: Array<Record<string, string>>;
}

interface Xit002Response {
  status?: string;
  data?: Array<{ id: string | number; name: string }>;
}

async function getCities(): Promise<Array<{ id: string; name: string }>> {
  const cacheKey = `cities:${TOKYO_PREF_CODE}`;
  const cached = getCached<{ cities: Array<{ id: string; name: string }> }>(cacheKey);
  if (cached) return cached.cities;
  const raw = (
    isMockMode()
      ? loadFixture("cities.json")
      : await fetchReinfolib("XIT002", { area: TOKYO_PREF_CODE })
  ) as Xit002Response;
  const cities = (raw.data ?? []).map((m) => ({ id: String(m.id), name: m.name }));
  setCached(cacheKey, { cities }, 7 * DAY_MS);
  return cities;
}

/** 1年分のXIT001レコードを取得（/api/transactions と同じキャッシュキーを共有） */
async function getYearRecords(year: string, city: string): Promise<Array<Record<string, string>>> {
  const cacheKey = `tx:${year}::${city}:`;
  const cached = getCached<Xit001Response>(cacheKey);
  if (cached) return cached.data ?? [];
  const body = (await fetchReinfolib("XIT001", {
    year,
    area: TOKYO_PREF_CODE,
    city,
    language: "ja",
  })) as Xit001Response | null;
  const result = body ?? { data: [] };
  setCached(cacheKey, result, DAY_MS);
  return result.data ?? [];
}

export function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof UpstreamError) {
      if (err.retryAfter) c.header("Retry-After", err.retryAfter);
      return c.json({ error: err.message }, err.status as 429);
    }
    console.error(err);
    return c.json({ error: "internal server error" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, mock: isMockMode() }));

  // フロントがレイヤートグルUIを動的生成するための一覧。apiCode 自体は渡さない。
  app.get("/api/layers", (c) =>
    c.json({
      layers: layers.map(({ id, label, kind, group, minZoom, maxZoom, apiCode }) => ({
        id,
        label,
        kind,
        group,
        minZoom,
        maxZoom,
        wired: apiCode !== null,
      })),
    }),
  );

  app.get("/api/cities", async (c) => c.json({ cities: await getCities() }));

  // 23区の直近N四半期・取引価格中央値ランキング
  app.get("/api/ranking", async (c) => {
    const quartersParam = c.req.query("quarters") ?? "4";
    if (!/^[1-8]$/.test(quartersParam)) {
      return c.json({ error: "query param 'quarters' must be 1-8" }, 400);
    }
    const quarters = Number(quartersParam);

    const cacheKey = `rank:${quarters}`;
    const cached = getCached<object>(cacheKey);
    if (cached) return c.json(cached);

    if (isMockMode()) {
      const body = loadFixture("ranking.json") as object;
      setCached(cacheKey, body, DAY_MS);
      return c.json(body);
    }

    // 実モード: 区ごとに今年+昨年のXIT001を取得（最大23区×2年=46コール、4並列・1日キャッシュ）
    const wards = (await getCities()).filter((city) => city.id.startsWith("131"));
    const currentYear = new Date().getFullYear();
    const years = [String(currentYear), String(currentYear - 1)];
    const results = await mapWithConcurrency(wards, 4, async (ward) => {
      const perYear = await Promise.all(
        years.map(async (year) => {
          try {
            return await getYearRecords(year, ward.id);
          } catch (e) {
            if (e instanceof UpstreamError && e.status !== 404) throw e;
            return [];
          }
        }),
      );
      const stat = medianOfRecentQuarters(perYear.flat(), quarters);
      return stat ? { city: ward.id, name: ward.name, ...stat } : null;
    });
    const entries = results
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.median - a.median);
    const body = { quarters, entries };
    setCached(cacheKey, body, DAY_MS);
    return c.json(body);
  });

  app.get("/api/transactions", async (c) => {
    const year = c.req.query("year");
    const city = c.req.query("city");
    const quarter = c.req.query("quarter");
    const priceClassification = c.req.query("priceClassification");
    if (!year || !/^\d{4}$/.test(year)) {
      return c.json({ error: "query param 'year' (YYYY) is required" }, 400);
    }
    if (!city || !/^\d{5}$/.test(city)) {
      return c.json({ error: "query param 'city' (5-digit code) is required" }, 400);
    }
    if (quarter && !/^[1-4]$/.test(quarter)) {
      return c.json({ error: "query param 'quarter' must be 1-4" }, 400);
    }

    const cacheKey = `tx:${year}:${quarter ?? ""}:${city}:${priceClassification ?? ""}`;
    const cached = getCached<Xit001Response>(cacheKey);
    if (cached) return c.json(cached);

    const body = (
      isMockMode() ? loadFixture("transactions.json") : await fetchReinfolib("XIT001", {
            year,
            area: TOKYO_PREF_CODE,
            city,
            language: "ja",
            ...(quarter ? { quarter } : {}),
            ...(priceClassification ? { priceClassification } : {}),
          })
    ) as Xit001Response;
    setCached(cacheKey, body, DAY_MS);
    return c.json(body);
  });

  app.get("/api/price-history", async (c) => {
    const city = c.req.query("city");
    const yearsParam = c.req.query("years") ?? "5";
    if (!city || !/^\d{5}$/.test(city)) {
      return c.json({ error: "query param 'city' (5-digit code) is required" }, 400);
    }
    if (!/^\d{1,2}$/.test(yearsParam) || Number(yearsParam) < 1 || Number(yearsParam) > 10) {
      return c.json({ error: "query param 'years' must be 1-10" }, 400);
    }
    const years = Number(yearsParam);

    const cacheKey = `hist:${city}:${years}`;
    const cached = getCached<{ city: string; points: PeriodStat[] }>(cacheKey);
    if (cached) return c.json(cached);

    let records: Array<Record<string, string>>;
    if (isMockMode()) {
      records = (loadFixture("transactions.json") as Xit001Response).data ?? [];
    } else {
      const currentYear = new Date().getFullYear();
      const targetYears = Array.from({ length: years }, (_, i) => String(currentYear - i));
      const perYear = await mapWithConcurrency(targetYears, 4, async (year) => {
        try {
          const res = (await fetchReinfolib("XIT001", {
            year,
            area: TOKYO_PREF_CODE,
            city,
            language: "ja",
          })) as Xit001Response | null;
          return res?.data ?? [];
        } catch (e) {
          // 直近年など未提供の年はデータなしとして扱う。認証エラーは即座に伝える。
          if (e instanceof UpstreamError && e.status !== 404) throw e;
          return [];
        }
      });
      records = perYear.flat();
    }

    const body = { city, points: aggregateByPeriod(records) };
    setCached(cacheKey, body, DAY_MS);
    return c.json(body);
  });

  app.get("/api/tiles/:layerId/:z/:x/:y", async (c) => {
    const { layerId, z, x, y } = c.req.param();
    const layer = findLayer(layerId);
    if (!layer) return c.json({ error: `unknown layer: ${layerId}` }, 400);
    if (![z, x, y].every((v) => /^\d+$/.test(v))) {
      return c.json({ error: "z/x/y must be non-negative integers" }, 400);
    }
    const zNum = Number(z);
    if (zNum < layer.minZoom || zNum > layer.maxZoom) {
      return c.json(
        { error: `zoom for '${layerId}' must be ${layer.minZoom}-${layer.maxZoom}` },
        400,
      );
    }
    const maxIndex = 2 ** zNum - 1;
    if (Number(x) > maxIndex || Number(y) > maxIndex) {
      return c.json({ error: "x/y out of range for zoom level" }, 400);
    }

    // ホワイトリスト外のクエリは黙って落とすのではなく 400 で知らせる
    const extraParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.req.query())) {
      if (!layer.allowedParams.includes(k)) {
        return c.json({ error: `query param '${k}' is not allowed for '${layerId}'` }, 400);
      }
      extraParams[k] = v;
    }

    const paramKey = Object.entries(extraParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const cacheKey = `tile:${layerId}:${z}/${x}/${y}:${paramKey}`;
    const cached = getCached<object>(cacheKey);
    if (cached) return c.json(cached);

    let body: object;
    if (isMockMode()) {
      if (!layer.fixture) return c.json({ error: `no fixture for layer '${layerId}'` }, 404);
      body = loadFixture(layer.fixture) as object;
    } else {
      if (layer.apiCode === null) {
        return c.json(
          { error: `layer '${layerId}' is not yet wired to an upstream API code` },
          501,
        );
      }
      try {
        body = (await fetchReinfolib(layer.apiCode, {
          response_format: "geojson",
          z,
          x,
          y,
          ...extraParams,
        })) as object;
      } catch (e) {
        // データのないタイルは 404 が返ることがある → 空の FeatureCollection として扱う
        if (e instanceof UpstreamError && e.status === 404) {
          body = { type: "FeatureCollection", features: [] };
        } else {
          throw e;
        }
      }
      if (body === null) body = { type: "FeatureCollection", features: [] };
    }
    setCached(cacheKey, body, DAY_MS);
    return c.json(body);
  });

  return app;
}
