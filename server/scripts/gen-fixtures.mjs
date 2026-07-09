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
console.log(`generated: transactions.json (${records.length} records), points.geojson (${features.length} points)`);
