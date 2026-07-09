# 東京「不動産価格 × 災害リスク」ビューワー 実装計画

不動産情報ライブラリ（reinfolib, 国土交通省）のAPIを使い、東京都の不動産取引価格を地図上に可視化し、ハザード情報・地価推移を重ねて見られるWebアプリを作る。

この計画書は、実装者（AIエージェント含む）がこのドキュメントだけを頼りに迷わず実装を進められることを目的に書かれている。**上から順にフェーズごとに実装し、各フェーズの受け入れ基準を満たしたらコミットすること。**

---

## 1. プロダクト概要

### 実現する機能

1. **価格マップ**: 東京都内の不動産取引価格（成約・取引価格）を地図上にポイント表示。価格帯で色分けし、ピン表示⇔ヒートマップを切替できる
2. **ハザードレイヤー**: 洪水浸水想定・土砂災害・津波・高潮などの災害リスク区域を半透明ポリゴンで重ね合わせ。レイヤーパネルでON/OFF
3. **地点詳細パネル**: ポイントをクリックすると、取引の詳細（価格・面積・建築年・最寄駅距離など）と、その市区町村の**価格推移チャート（過去5年・四半期ごとの中央値）**、その地点に重なっているハザード情報を表示
4. **（ストレッチ）** 用途地域レイヤー、将来推計人口メッシュ、駅別価格ランキング

### 非機能要件

- APIキーはサーバー側で秘匿する（ブラウザに露出させない）
- APIキーがなくてもモックデータで開発・CI・デモが完結する（**モックモード必須**）
- レスポンスはサーバー側でキャッシュし、reinfolib APIへのリクエストを最小化する
- 地図に出典表示: 「出典: 不動産情報ライブラリ（国土交通省）」「地理院タイル」

---

## 2. 技術スタック（この構成で固定）

| 領域 | 選定 | 理由 |
|---|---|---|
| モノレポ | npm workspaces（`client/` と `server/`） | 追加ツール不要 |
| フロント | Vite + React 18 + TypeScript | 標準的でscaffoldが速い |
| 地図 | MapLibre GL JS v4 | ベクトルタイル(pbf)とGeoJSON両対応、無料 |
| ベース地図 | 地理院タイル淡色 `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png` | APIキー不要 |
| チャート | Recharts | React親和性 |
| サーバー | Hono + @hono/node-server (Node 20+) | 軽量、テストしやすい |
| キャッシュ | lru-cache（メモリ内） | 単一プロセスで十分 |
| テスト | Vitest（client/server共通） | |
| Lint/Format | ESLint + Prettier（デフォルト設定でよい） | |

状態管理ライブラリ・ルーターは**導入しない**（React標準の useState / useContext で足りる）。

---

## 3. reinfolib API 基礎知識（実装前に必読）

### 認証・共通事項

- ベースURL: `https://www.reinfolib.mlit.go.jp/ex-api/external/{API番号}`
- 認証: リクエストヘッダー `Ocp-Apim-Subscription-Key: <APIキー>`
- APIキーは https://www.reinfolib.mlit.go.jp/api/request/ から無料申請（審査 約5営業日）
- レスポンスはgzip圧縮。Node 18+の `fetch` は通常自動解凍するが、`Content-Encoding` ヘッダーが欠けているケースに備え、解凍失敗時はレスポンスボディの先頭2バイトが `0x1f 0x8b` かを確認して手動gunzipするフォールバックを入れること
- 公式マニュアル: https://www.reinfolib.mlit.go.jp/help/apiManual/ （**サーバーからのWebFetchは403になることがある。ブラウザ相当のUAでも取れない場合はこの計画書の記載を正とし、疑義があればユーザーに確認**）

### APIは2系統ある

**A. 一覧系（クエリパラメータ → JSON配列）**

| コード | 内容 | 主なパラメータ |
|---|---|---|
| XIT001 | 不動産取引価格・成約価格 | `year`(必須, 例:2024), `quarter`(1-4), `area`(都道府県コード, 東京=13), `city`(5桁市区町村コード, 例:13101=千代田区), `priceClassification`(01=取引価格のみ/02=成約価格のみ/未指定=両方), `language=ja` |
| XIT002 | 都道府県内市区町村一覧 | `area`(都道府県コード) |

XIT001のレスポンス例（`data`配列の1要素、主要フィールド）:

```json
{
  "Type": "宅地(土地と建物)",
  "Prefecture": "東京都",
  "Municipality": "千代田区",
  "DistrictName": "飯田橋",
  "TradePrice": "120000000",
  "Area": "60",
  "BuildingYear": "2010年",
  "Structure": "ＲＣ",
  "Use": "住宅",
  "CityPlanning": "商業地域",
  "Period": "2024年第１四半期"
}
```

数値フィールドは**文字列で返る**。`TradePrice`は円。パースユーティリティを必ず作ること（後述）。

**B. タイル系（XYZタイル座標 → GeoJSON または MVT/pbf）**

URL形式: `.../ex-api/external/{コード}?response_format={geojson|pbf}&z={z}&x={x}&y={y}&(追加パラメータ)`

- タイル座標は Web Mercator の XYZ 方式（Google/OSM互換。MapLibreの標準と同じ）
- pbf（MVT）の場合、**source-layer 名は `hits`**
- 主なコード:

| コード | 内容 | 追加パラメータ | ズーム範囲 |
|---|---|---|---|
| XPT001 | 取引価格ポイント | `from`/`to`（四半期 `YYYYN` 形式, N=1..4。例: `20223`=2022Q3）, `priceClassification` | z=11〜15 |
| XPT002 | 地価公示・地価調査ポイント | `year`, `priceClassification`(0=公示/1=調査) | z=13〜15 |
| XKT系 | 都市計画（用途地域・防火地域等）、施設、災害区域、人口メッシュ等 | コードによる | コードによる |

### ⚠️ XKT系コードの確定手順（Phase 4冒頭で必ず実施）

XKT系の番号割当（例: 洪水浸水想定区域が何番か）は情報源によって記載が揺れており、また2025年12月に防災情報API 5種（洪水浸水想定区域・土砂災害警戒区域・津波浸水想定・高潮浸水想定区域・指定緊急避難場所）が追加されている。**番号をハードコードで信じ込まず、以下の手順で確定すること:**

1. 公式マニュアル一覧 `https://www.reinfolib.mlit.go.jp/help/apiManual/` 配下の `xkt001/`〜`xkt040/` 相当のページ、またはAPIキー取得後に実タイルを1枚fetchして確認する
2. 確定したコードは `server/src/config/layers.ts` の1ファイルにのみ記述する（後述のレイヤーレジストリ）。**コード番号がアプリの他の場所に現れてはならない**
3. 確認できるまでは、モックのGeoJSONフィクスチャでレイヤー機能を実装・テストしておく（設計上それで完結するようにしてある）

---

## 4. リポジトリ構成

```
/
├── package.json              # workspaces: ["client", "server"], scripts: dev/build/test/lint
├── .gitignore                # node_modules, dist, .env, server/.cache
├── .env.example              # REINFOLIB_API_KEY=（説明コメント付き）
├── README.md                 # セットアップ手順・モックモードの使い方
├── PLAN.md                   # 本ドキュメント
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          # エントリ: Hono起動 (port 8787)
│   │   ├── app.ts            # ルーティング定義（テスト対象。index.tsから分離）
│   │   ├── reinfolib.ts      # reinfolib HTTPクライアント（認証・gzipフォールバック・エラー変換）
│   │   ├── cache.ts          # lru-cacheラッパー（key: URL+query, TTL指定可）
│   │   ├── mock.ts           # MOCK=1時にfixturesを返す
│   │   ├── config/
│   │   │   └── layers.ts     # レイヤーレジストリ（唯一のXKT/XPTコード記述場所）
│   │   └── lib/
│   │       └── stats.ts      # 中央値等の集計純関数
│   ├── fixtures/             # モックデータ（手書きの小さなGeoJSON/JSON）
│   │   ├── transactions.json       # XIT001形式 20件程度（千代田区・新宿区の実在風データ）
│   │   ├── cities.json             # XIT002形式 東京都の全62市区町村
│   │   ├── points.geojson          # XPT001形式 FeatureCollection 20点（東京駅周辺）
│   │   └── hazard-flood.geojson    # 洪水想定風ポリゴン 3〜4個（皇居東側あたりに適当に）
│   └── test/
│       ├── app.test.ts       # ルートのテスト（モックモードで実行）
│       └── stats.test.ts
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts        # /api を http://localhost:8787 へproxy
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # レイアウト: 地図全面 + 左上LayerPanel + 右DetailPanel
        ├── components/
        │   ├── MapView.tsx       # MapLibre初期化・ソース/レイヤー管理・クリックハンドラ
        │   ├── LayerPanel.tsx    # レイヤートグル・期間セレクタ・表示モード切替
        │   ├── DetailPanel.tsx   # クリック地点の詳細
        │   └── PriceChart.tsx    # Recharts折れ線（四半期×中央値）
        ├── hooks/
        │   └── usePriceHistory.ts  # /api/price-history フェッチ
        ├── lib/
        │   ├── api.ts            # fetchラッパー
        │   ├── format.ts         # 価格の億/万円表記、文字列数値パース
        │   └── colors.ts         # 価格帯→色スケール定義
        └── types.ts              # Transaction, LayerDef など共有型
```

---

## 5. サーバー（プロキシ）仕様

### エンドポイント

| メソッド/パス | 動作 | キャッシュTTL |
|---|---|---|
| `GET /api/health` | `{ ok: true, mock: boolean }` | なし |
| `GET /api/layers` | レイヤーレジストリの内容（フロントがトグルUIを動的生成するため） | なし |
| `GET /api/cities` | XIT002 `area=13` を整形して返す | 7日 |
| `GET /api/transactions?year=&quarter=&city=` | XIT001をそのまま中継。`city`必須（レスポンス肥大防止）、`year`必須 | 24時間 |
| `GET /api/price-history?city=&years=5` | XIT001を年×四半期でN回呼び、`{ period: "2023Q1", median: number, count: number }[]` に集計して返す | 24時間 |
| `GET /api/tiles/:layerId/:z/:x/:y` | レイヤーレジストリで`layerId`→APIコードを引き、reinfolibタイルAPIへ中継。`response_format=geojson`固定。クエリ(`from`,`to`等)はホワイトリストで通す | 24時間 |

**注意: フロントは reinfolib のコード（XPT001等）を一切知らない。** `layerId`（例: `transaction-points`, `flood`）だけを使う。コード⇔ID対応はレイヤーレジストリのみが持つ。

### レイヤーレジストリ (`server/src/config/layers.ts`)

```ts
export interface LayerDef {
  id: string;              // フロントが使うID (例: "flood")
  apiCode: string | null;  // reinfolibコード (例: "XKT026")。null = 実コード未確定（モックのみで動く）
  label: string;           // UI表示名 (例: "洪水浸水想定区域")
  kind: "point" | "polygon";
  minZoom: number;
  maxZoom: number;
  allowedParams: string[]; // 中継を許可するクエリキー (例: ["from", "to"])
  fixture: string | null;  // モック時に返すfixtureファイル名
}

export const layers: LayerDef[] = [
  { id: "transaction-points", apiCode: "XPT001", label: "取引価格ポイント",
    kind: "point", minZoom: 11, maxZoom: 15,
    allowedParams: ["from", "to", "priceClassification"], fixture: "points.geojson" },
  { id: "land-price-points", apiCode: "XPT002", label: "地価公示・地価調査",
    kind: "point", minZoom: 13, maxZoom: 15,
    allowedParams: ["year", "priceClassification"], fixture: "points.geojson" },
  // ハザード系: apiCodeはPhase 4で公式マニュアル確認後に埋める
  { id: "flood", apiCode: null, label: "洪水浸水想定区域",
    kind: "polygon", minZoom: 11, maxZoom: 15, allowedParams: [], fixture: "hazard-flood.geojson" },
  { id: "landslide", apiCode: null, label: "土砂災害警戒区域",
    kind: "polygon", minZoom: 11, maxZoom: 15, allowedParams: [], fixture: "hazard-flood.geojson" },
  { id: "tsunami", apiCode: null, label: "津波浸水想定",
    kind: "polygon", minZoom: 11, maxZoom: 15, allowedParams: [], fixture: "hazard-flood.geojson" },
  { id: "storm-surge", apiCode: null, label: "高潮浸水想定区域",
    kind: "polygon", minZoom: 11, maxZoom: 15, allowedParams: [], fixture: "hazard-flood.geojson" },
];
```

`apiCode: null` のレイヤーは、実モードでは `501 { error: "layer not yet wired to upstream API" }` を返す。モックモードではfixtureを返す。**これによりハザードUIはAPIコード確定前に完成させられる。**

### 動作モード

- `REINFOLIB_API_KEY` があれば実モード、なければ**自動的にモックモード**（起動ログに `[mock mode] REINFOLIB_API_KEY not set` と明示）。`MOCK=1` で強制モック
- モックモードでは全エンドポイントがfixturesから応答する。タイルリクエストはz/x/yに関わらず同じfixtureを返してよい（表示確認用なので十分）

### エラーハンドリング

- 上流401/403 → `502 { error: "reinfolib auth failed. Check REINFOLIB_API_KEY." }`
- 上流429 → `429`をそのまま返し `Retry-After` を透過
- 上流タイムアウト(15s) → `504`
- 不正な`layerId`/ホワイトリスト外パラメータ → `400`

### 集計ユーティリティ (`server/src/lib/stats.ts`) — 純関数・テスト必須

```ts
// "120000000" → 120000000, "" | undefined | 非数値 → null
export function parseNumeric(s: string | undefined): number | null;
// "2024年第１四半期"（全角数字あり得る）→ "2024Q1"、解釈不能なら null
export function parsePeriod(s: string): string | null;
// 空配列→null、偶数個は平均
export function median(nums: number[]): number | null;
// XIT001レコード配列 → periodごとにTradePriceの中央値と件数
export function aggregateByPeriod(records: { Period: string; TradePrice: string }[]):
  { period: string; median: number; count: number }[];
```

---

## 6. フロントエンド仕様

### 画面レイアウト

- 地図が全画面。左上にフローティングの `LayerPanel`、地点クリックで右側から `DetailPanel` がスライドイン（幅360px、×ボタンで閉じる）
- 初期視点: 東京駅 `center: [139.767, 35.681], zoom: 13`
- モバイル対応は不要（デスクトップ前提でよい）

### MapView

- ベース: 地理院淡色タイルを rasterソースで。attributionに「地理院タイル」「出典: 不動産情報ライブラリ（国土交通省）」
- 取引ポイント: GeoJSONソース。**表示中のタイル範囲を自前計算せず、MapLibreの `addSource({ type: "geojson", data: url })` ではなく、ズーム/移動のたびに現在のビューポートを覆うタイル座標一覧を計算して `/api/tiles/transaction-points/{z}/{x}/{y}?from=&to=` を並列fetchし、FeatureCollectionをマージして `setData` する方式**にする（geojsonはタイル単位でしか取れないため）。実装は `lib/tiles.ts` に `lngLatBoundsToTiles(bounds, z): {z,x,y}[]` を作り、ユニットテストを書く。z は `Math.min(15, Math.max(11, Math.floor(map.getZoom())))` に丸める。fetch結果はクライアント側でも `Map<string, FeatureCollection>` にキャッシュし、同一タイルの再fetchを避ける。移動のたびのfetchは300msデバウンス
- ポイント描画: `circle` レイヤー。色は価格5段階（〜3千万/〜6千万/〜1億/〜3億/3億超。色スケールは `lib/colors.ts` に一元化。色覚多様性に配慮した連続スケール系の5色を使う）。`circle-radius` はズーム連動 (z11:3px → z15:8px)
- ヒートマップ切替: 同一ソースに `heatmap` レイヤーも作っておき、LayerPanelのトグルで `setLayoutProperty(visibility)` を切替
- ハザードレイヤー: レイヤーごとにGeoJSONソース + `fill` レイヤー（`fill-opacity: 0.35`、レイヤーごとに固定色: 洪水=青系, 土砂=茶系, 津波=紫系, 高潮=緑系）。トグルONのときだけタイルfetch開始
- クリック: `map.queryRenderedFeatures(point)` で (1)取引ポイント (2)表示中ハザードポリゴン を拾い、DetailPanelへ渡す

### DetailPanel

- 取引ポイントのproperties一覧（ラベルは日本語化: 価格/種類/面積/建築年/構造/用途/地区名/期間）
- 価格は `format.ts` の `formatPrice()` で「1.2億円」「3,500万円」表記
- **このポイントの市区町村コード**（propertiesに市区町村名 or コードが含まれる。なければ地区名から `/api/cities` の結果と突合）で `usePriceHistory(city)` を呼び、`PriceChart` に過去5年の四半期中央値の折れ線を表示。ローディング中はスケルトン表示
- クリック地点に重なっているハザード: 「⚠ 洪水浸水想定区域内」のようなバッジ列。重なりゼロなら「表示中のハザード区域には該当しません」

### LayerPanel

- `/api/layers` の結果からトグルを動的生成（point系は「価格ポイント/ヒートマップ/非表示」の3値、polygon系はON/OFF）
- 期間セレクタ: from/to の四半期プルダウン（2015Q1〜直近四半期を生成）。変更時はポイントのタイルキャッシュを破棄して再fetch
- 凡例: 価格5段階の色とハザード各色を下部に常時表示

---

## 7. 実装フェーズ（この順で。各フェーズ完了時にコミット）

### Phase 0: スキャフォールド
- npm workspaces、client(Vite react-ts)、server(Hono)、Vitest、ESLint/Prettier、`.env.example`、`.gitignore`、README（起動手順: `npm install` → `npm run dev` でclient:5173 + server:8787が同時起動。concurrently使用可）
- fixturesを4ファイル作成（§4参照。points.geojsonの座標は東京駅±0.02度内に散らす。propertiesはXIT001と同じキー名にする）
- **受け入れ基準**: `npm run dev` で両方起動し `curl localhost:8787/api/health` が `{"ok":true,"mock":true}` を返す。`npm test` がパス（空テスト1本でよい）

### Phase 1: プロキシ完成（モック＋実装）
- `reinfolib.ts`（認証ヘッダー・gzipフォールバック・タイムアウト）、`cache.ts`、`mock.ts`、レイヤーレジストリ、全エンドポイント、エラーハンドリング
- テスト: モックモードで各ルートのステータス/形状、`stats.ts` 全関数（全角数字の`parsePeriod`、空配列`median`含む）、不正layerId→400、apiCode:null実モード→501
- **受け入れ基準**: `npm test` パス。モックモードで `/api/tiles/flood/13/7276/3225` がGeoJSONを返す

### Phase 2: 地図＋価格ポイント
- MapView（ベース地図・タイルfetch方式・circleレイヤー・凡例）、`lib/tiles.ts` とそのテスト、クリックでpropertiesをconsole出力まで
- **受け入れ基準**: モックモードでブラウザに地図と色分けポイントが表示され、パン/ズームでfetchが走る（重複fetchしない）。`npm run build` が通る

### Phase 3: DetailPanel＋価格推移チャート
- DetailPanel、PriceChart、`/api/price-history` 連携、`format.ts` とテスト
- モック時の `/api/price-history` は fixtures/transactions.json から集計した実出力を返す（=集計コードがモックでも実際に動く）
- **受け入れ基準**: ポイントクリックで詳細＋チャートが表示される

### Phase 4: ハザードレイヤー
- **まず§3の手順でXKT実コードを確定し、layers.tsのapiCodeを埋める**（確認できない場合はnullのまま進め、READMEに「要APIコード確認」と明記して先へ）
- LayerPanelのトグル→タイルfetch→fillレイヤー表示、クリック時のハザードバッジ
- **受け入れ基準**: モックモードでハザードトグルONにするとポリゴンが表示され、区域内のポイントクリックでバッジが出る

### Phase 5（ストレッチ・任意）: 用途地域レイヤー / 地価公示ポイント / ヒートマップ磨き込み
### Phase 6: 仕上げ
- ローディング/エラーのUI表示（トースト等は不要、パネル内テキストで可）、README完成（スクリーンショット、APIキー申請手順リンク、モック/実モード説明）、`npm run lint && npm test && npm run build` 全通過
- **受け入れ基準**: クリーンclone → `npm install` → `npm run dev` だけでモックのフルデモが動く

---

## 8. 落とし穴チェックリスト（実装中に随時参照）

- [ ] XIT001の数値は全て文字列。`parseNumeric` を通さず `Number()` を直書きしない
- [ ] `Period` は「2024年第１四半期」形式で**全角数字**が来る
- [ ] タイルAPIの四半期パラメータは `YYYYN`（例: `20241`）。`YYYY-Q1` 形式ではない
- [ ] gzip: fetchが自動解凍しないケースのフォールバック（マジックバイト `1f 8b` 確認）
- [ ] pbfを使う場合の source-layer 名は `hits`（本計画ではgeojson固定なので通常不要）
- [ ] APIキーをクライアントコード・コミット・ログに絶対に出さない（`.env` はgitignore済みか）
- [ ] reinfolibへの同時リクエストは最大4並列に制限（タイル一括fetch時）
- [ ] 出典表示（不動産情報ライブラリ・地理院タイル）をattributionに入れたか
- [ ] 地理院タイルのズームは淡色で z5〜18。reinfolibタイルとズーム範囲が違う点に注意（minZoom未満ではレイヤー非表示＋パネルに「ズームインしてください」）

## 9. 参考リンク

- API操作説明（公式）: https://www.reinfolib.mlit.go.jp/help/apiManual/
- API利用申請: https://www.reinfolib.mlit.go.jp/api/request/
- XIT001 マニュアル: https://www.reinfolib.mlit.go.jp/help/apiManual/xit001/
- XPT001 マニュアル: https://www.reinfolib.mlit.go.jp/help/apiManual/xpt001/
- 地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html
