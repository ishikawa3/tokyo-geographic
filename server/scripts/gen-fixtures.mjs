// fixtures 生成スクリプト（決定的・擬似乱数）
import { writeFileSync, mkdirSync } from "node:fs";

const outDir = process.argv[2];
mkdirSync(outDir, { recursive: true });

// 単純なLCG（毎回同じ出力にするため）
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

const districts = ["丸の内", "大手町", "内神田", "神田錦町", "九段南", "飯田橋", "麹町", "有楽町"];
const types = ["宅地(土地と建物)", "中古マンション等", "宅地(土地)"];
const structures = ["ＲＣ", "ＳＲＣ", "鉄骨造", "木造"];
const uses = ["住宅", "事務所", "店舗", "共同住宅"];
const zones = ["商業地域", "近隣商業地域", "第１種住居地域"];
const fwDigits = ["０", "１", "２", "３", "４"];

// --- transactions.json: 2021Q1〜2025Q4、各四半期2件、緩やかな上昇トレンド ---
const records = [];
for (let year = 2021; year <= 2025; year++) {
  for (let q = 1; q <= 4; q++) {
    const trend = 1 + (year - 2021) * 0.08 + (q - 1) * 0.01; // 年8%上昇
    for (let i = 0; i < 2; i++) {
      const base = 30_000_000 + rand() * 220_000_000;
      const price = Math.round((base * trend) / 100_000) * 100_000;
      const area = Math.round(30 + rand() * 120);
      records.push({
        Type: pick(types),
        Region: "商業地",
        MunicipalityCode: "13101",
        Prefecture: "東京都",
        Municipality: "千代田区",
        DistrictName: pick(districts),
        TradePrice: String(price),
        Area: String(area),
        UnitPrice: String(Math.round(price / area)),
        BuildingYear: `${1985 + Math.floor(rand() * 38)}年`,
        Structure: pick(structures),
        Use: pick(uses),
        CityPlanning: pick(zones),
        // 実APIと同じく全角数字の四半期表記
        Period: `${year}年第${fwDigits[q]}四半期`,
      });
    }
  }
}
writeFileSync(`${outDir}/transactions.json`, JSON.stringify({ status: "OK", data: records }, null, 2));

// --- points.geojson: 東京駅(139.767, 35.681)周辺に20点、価格5段階を網羅 ---
// 5段階: 〜3千万 / 〜6千万 / 〜1億 / 〜3億 / 3億超
const priceBuckets = [
  [12_000_000, 28_000_000],
  [32_000_000, 58_000_000],
  [62_000_000, 98_000_000],
  [110_000_000, 290_000_000],
  [320_000_000, 900_000_000],
];
const features = [];
for (let i = 0; i < 20; i++) {
  const [lo, hi] = priceBuckets[i % 5];
  const price = Math.round((lo + rand() * (hi - lo)) / 100_000) * 100_000;
  const lng = 139.767 + (rand() - 0.5) * 0.036;
  const lat = 35.681 + (rand() - 0.5) * 0.028;
  const area = Math.round(25 + rand() * 130);
  const q = 1 + Math.floor(rand() * 4);
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
    properties: {
      Type: pick(types),
      Prefecture: "東京都",
      Municipality: "千代田区",
      MunicipalityCode: "13101",
      DistrictName: pick(districts),
      TradePrice: String(price),
      Area: String(area),
      UnitPrice: String(Math.round(price / area)),
      BuildingYear: `${1985 + Math.floor(rand() * 38)}年`,
      Structure: pick(structures),
      Use: pick(uses),
      CityPlanning: pick(zones),
      Period: `${2024 + Math.floor(rand() * 2)}年第${fwDigits[q]}四半期`,
    },
  });
}
writeFileSync(
  `${outDir}/points.geojson`,
  JSON.stringify({ type: "FeatureCollection", features }, null, 2),
);
// --- land-price-points.geojson: 地価公示・地価調査風の12点（東京駅周辺） ---
// 実APIのプロパティ名は未確認のため、クライアントは既知キーがなければ汎用表示にフォールバックする
const useCategories = ["商業地", "住宅地"];
const landPriceFeatures = [];
for (let i = 0; i < 12; i++) {
  const lng = 139.767 + (rand() - 0.5) * 0.034;
  const lat = 35.681 + (rand() - 0.5) * 0.026;
  const unitPrice = Math.round((800_000 + rand() * 4_200_000) / 10_000) * 10_000; // 円/㎡
  landPriceFeatures.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
    properties: {
      TargetYearPrice: String(unitPrice),
      PriceCategory: rand() < 0.6 ? "地価公示" : "都道府県地価調査",
      StandardLotNumber: `千代田${1 + Math.floor(rand() * 9)}-${1 + Math.floor(rand() * 30)}`,
      UseCategory: pick(useCategories),
      Municipality: "千代田区",
      MunicipalityCode: "13101",
    },
  });
}
writeFileSync(
  `${outDir}/land-price-points.geojson`,
  JSON.stringify({ type: "FeatureCollection", features: landPriceFeatures }, null, 2),
);

// --- ranking.json: 23区の直近4四半期・中央値ランキング（現実味のある序列） ---
// [区コード下3桁, 区名, 中央値のベース(万円)]
const wards = [
  ["101", "千代田区", 14800],
  ["103", "港区", 13200],
  ["113", "渋谷区", 12100],
  ["102", "中央区", 10900],
  ["104", "新宿区", 9400],
  ["110", "目黒区", 9100],
  ["105", "文京区", 8600],
  ["109", "品川区", 8200],
  ["112", "世田谷区", 7600],
  ["106", "台東区", 7100],
  ["114", "中野区", 6800],
  ["116", "豊島区", 6600],
  ["108", "江東区", 6300],
  ["115", "杉並区", 6100],
  ["107", "墨田区", 5600],
  ["111", "大田区", 5400],
  ["117", "北区", 5100],
  ["119", "板橋区", 4700],
  ["120", "練馬区", 4500],
  ["118", "荒川区", 4400],
  ["122", "葛飾区", 3800],
  ["123", "江戸川区", 3700],
  ["121", "足立区", 3400],
];
const entries = wards.map(([suffix, name, baseMan]) => ({
  city: `13${suffix}`,
  name,
  median: (baseMan + Math.round(rand() * 400 - 200)) * 10_000,
  count: 20 + Math.floor(rand() * 180),
}));
entries.sort((a, b) => b.median - a.median);
writeFileSync(`${outDir}/ranking.json`, JSON.stringify({ quarters: 4, entries }, null, 2));

console.log(
  `generated: transactions.json (${records.length} records), points.geojson (${features.length} points), ` +
    `land-price-points.geojson (${landPriceFeatures.length} points), ranking.json (${entries.length} wards)`,
);
