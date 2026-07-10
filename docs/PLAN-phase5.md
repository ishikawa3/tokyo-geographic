# Phase 5 実装計画: 地価公示ポイント・区別価格ランキング・用途地域レイヤー

PLAN.md（Phase 0〜4, 6 実装済み・PR #1 でマージ済み）の続き。既存のアーキテクチャ（レイヤーレジストリ・モックモード・タイル中継プロキシ）をそのまま使う。**PLAN.md の §3（API基礎知識）と §8（落とし穴チェックリスト）を先に読むこと。**

3つのサブフェーズは独立しており、5A → 5C → 5B の順で実装する（依存が少なく価値が高い順）。各サブフェーズ完了時にコミットする。

---

## 5A. 地価公示・地価調査ポイント表示

### 現状

レイヤーレジストリ（`server/src/config/layers.ts`）に `land-price-points`（XPT002, z13〜15, fixture: points.geojson）が**配線済みだが、フロントに UI がない**。LayerPanel はpolygon系しかトグルを出さず、MapView も point kind は `transaction-points` しか描画しない。

### やること

1. **専用 fixture**: `server/fixtures/land-price-points.geojson` を新規作成し、レジストリの `fixture` を差し替える。生成は `server/scripts/gen-fixtures.mjs` に追記（既存の乱数シードを変えないよう、生成コードは既存処理の**後ろ**に追加）。東京駅周辺に12点、プロパティは地価公示風:
   ```json
   {
     "TargetYearPrice": "2350000",        // 円/㎡（文字列）
     "PriceCategory": "地価公示",          // or "都道府県地価調査"
     "StandardLotNumber": "千代田5-22",
     "UseCategory": "商業地",
     "Municipality": "千代田区",
     "MunicipalityCode": "13101"
   }
   ```
   ※ 実APIのプロパティ名は公式マニュアル（xpt002）確認まで不明。**クライアントは既知キーがなければ汎用の key-value 表示にフォールバックする**設計にし、実API接続時はここだけ直せば済むようにする。
2. **MapView**: `land-price-points` 用の GeoJSON ソース + circle レイヤーを追加。
   - 色は単色 `#eda100`（`HAZARD_COLORS["land-price-points"]` に定義済み）。取引ポイント（青系）と混ざっても見分けられるよう **circle-stroke-width: 1.5, stroke色 #0b0b0b** で縁取りを濃くする
   - `year` パラメータ（LayerPanel に年セレクタ、2015〜今年、デフォルト昨年）を `/api/tiles/land-price-points/{z}/{x}/{y}?year=YYYY` に付ける
   - minZoom 13: ズーム13未満ではソースを空にし、レイヤーON時のみステータスバーに「ズーム13以上で地価ポイントが表示されます」
   - タイルローダー・世代トークン・クリック処理は取引ポイントの実装をそのまま流用（`reloadPoints` を汎用化して両ポイントレイヤーで共用する。コピペで2本にしない）
3. **LayerPanel**: 「地価公示・地価調査」トグル（チェックボックス＋年セレクタ）を「取引価格の表示」セクションの下に追加
4. **DetailPanel**: クリックした feature がどのレイヤー由来か区別できるよう、`Selection.point` を `{ layerId, props }` 構造に変更（**破壊的変更**: App/MapView/DetailPanel の3ファイルに波及。既存の取引ポイント表示が壊れていないことをテスト・ブラウザ両方で確認）。地価ポイントは:
   - 見出し: `TargetYearPrice` があれば `formatPrice(円/㎡)/㎡`、なければ「地価情報」
   - `PriceCategory` バッジ、既知キーのラベル表（`PROP_LABELS_LAND_PRICE` を format.ts に追加）、未知キーは「その他の情報」として key-value 表示
   - 価格推移チャートは MunicipalityCode があれば従来どおり表示

### 受け入れ基準

- モックモードでトグルON → z13以上で黄色ポイントが表示され、クリックで地価用の詳細パネルが出る
- 取引ポイントの既存動作（色分け・詳細・チャート）が壊れていない
- `npm test` / `npm run lint` / `npm run build` 通過

---

## 5C. 区別価格ランキングパネル

### やること

1. **サーバー**: `GET /api/ranking?quarters=4` を追加。
   - レスポンス: `{ quarters: 4, entries: [{ city: "13101", name: "千代田区", median: number, count: number }] }`（median 降順ソート済み。count は集計対象の取引件数）
   - 対象は **23区のみ**（cities のうち `id` が `131` で始まるもの。市部まで含めると上流23+26=49コールになるため）
   - 実モード: 区ごとに XIT001 を今年＋昨年の2年分取得（`mapWithConcurrency` で**4並列**、既存の `tx:` キャッシュキーと同じ形式で1日キャッシュ）→ `parsePeriod` で直近 N 四半期のレコードに絞り、`median(TradePrice)` を計算。**46コール発生するので初回は遅い（〜30秒）ことを想定し、レスポンス全体も `rank:${quarters}` キーで1日キャッシュ**
   - データが1件もない区は entries から除外
   - モックモード: `fixtures/ranking.json` を返す（gen-fixtures.mjs で23区分を生成。千代田・港・渋谷あたりを上位にした現実味のある値で、median 降順に並べて保存）
   - `quarters` は 1〜8 のみ許可（それ以外は 400）
   - **集計ロジックは `server/src/lib/stats.ts` に純関数 `medianOfRecentQuarters(records, quarters, now)` として切り出し、単体テストを書く**（直近N四半期の境界判定が要注意: "now" を引数で受け取りテスト可能にする）
2. **クライアント**: 左下にランキングパネル（`components/RankingPanel.tsx`）。
   - 折りたたみ可能（ヘッダー「23区 価格ランキング（直近4四半期）」クリックで開閉、初期は閉）
   - 開いたときに初めて `/api/ranking` を fetch（初回が遅い可能性があるためスケルトン表示、失敗時はパネル内にエラーテキスト）
   - 行: 順位・区名・中央値（`formatPrice`）。**バーは付けない**（値は表で十分。付けるなら dataviz スキルの規約に従うこと）
   - 行クリックで `map.flyTo` その区の中心へ（zoom 13）。区の中心座標は `client/src/lib/wardCenters.ts` に23区分をハードコード（区役所所在地の概略座標でよい。出典コメントを書く）
   - MapView に `flyTo` を公開する必要がある → `MapView` に `onMapReady?: (api: { flyTo(lngLat: [number,number]) => void }) => void` プロップを追加し、App 経由で RankingPanel に渡す（map インスタンス自体は漏らさない）
3. **テスト**: `medianOfRecentQuarters` の境界（ちょうどN四半期前を含む/含まない、全角Period、空）、`/api/ranking` のモック応答（降順・件数・400系）

### 受け入れ基準

- モックモードでパネルを開くと23区のランキングが降順表示され、行クリックで地図が移動する
- サーバーテストに ranking 系が追加され全通過

---

## 5B. 用途地域レイヤー

### やること

1. **レジストリ追加**（layers.ts）:
   ```ts
   { id: "youto", apiCode: null,  // 公式マニュアルで XKT002 と思われるが未確認。確認後に埋める
     label: "用途地域", kind: "polygon", minZoom: 11, maxZoom: 15,
     allowedParams: [], fixture: "youto.geojson" }
   ```
   ※ ハザードと同じ「apiCode: null → 実モード501」パターン。**新規コード追加は不要**（既存のタイル中継がそのまま効く）。
2. **fixture**: `server/fixtures/youto.geojson`。東京駅周辺に4〜5ポリゴン、`properties: { "用途地域": "商業地域" }` 等。種別は「商業地域」「近隣商業地域」「第一種住居地域」「工業地域」の4種を含める
3. **クライアント**: 用途地域は**種別ごとの色分け**（データ駆動スタイル）が必要で、ハザードの単色fillと違う:
   - `lib/colors.ts` に `YOUTO_COLORS: Record<string,string>` を追加。種別は12種+その他。色は国交省の用途地域標準配色に**寄せた淡い色**（例: 商業=薄赤、住居系=薄緑〜黄緑、工業系=薄青紫）を使い、`fill-opacity: 0.3`。地図の慣習色を優先し、dataviz カテゴリカルパレットは使わなくてよい（凡例必須）
   - MapView: `match` 式で `["get", "用途地域"]` → 色。**プロパティキーが実APIで違う可能性が高い**ので、キー名は colors.ts の定数 `YOUTO_PROP_KEY` に一元化
   - LayerPanel: ハザードとは別セクション「都市計画」にトグル＋ON時のみ凡例（種別色）を表示
   - クリック時: DetailPanel のバッジ列に「用途地域: 商業地域」を表示（ハザードバッジと同じ仕組み。`hazards` 配列の名称を `overlays` に変えるか、そのまま流用するかは実装時に判断してよい）

### 受け入れ基準

- モックモードでトグルON → 種別ごとに色分けされたポリゴンと凡例が表示され、クリックで用途地域名がパネルに出る

---

## 5D. スマホ対応（レスポンシブUI）

PLAN.md では「モバイル対応は不要」としていたが、要件変更によりスマホでの閲覧に対応する。ブレークポイントは **640px**（`@media (max-width: 640px)`）。

1. **レイヤーパネル**: モバイルでは初期状態を閉じ、左上の「☰ レイヤー」ボタンで開閉する。開閉状態は App が持ち（`useState(() => window.matchMedia("(min-width: 641px)").matches)`）、デスクトップでは従来どおり初期表示
2. **詳細パネル**: モバイルではボトムシート化（`width: 100%`、`height: 55%`、上角丸、下端固定）。CSSのみで実現し、コンポーネントは共通
3. **ランキングパネル**: 既に折りたたみ式なのでそのまま。モバイルでは幅を画面に合わせる
4. **地図操作**: MapLibre のタッチ操作は標準対応のため追加実装不要。タップ＝クリックとして既存のハンドラが動く
5. **検証**: Playwright でモバイルビューポート（390×844）でも画面確認する

## 共通の注意

- **PLAN.md §8 のチェックリストを常時参照**（数値は文字列、全角数字、YYYYN形式、出典表示）
- 既存テスト46件を壊さない。Selection 構造変更（5A）後は必ず全テスト＋ブラウザ確認
- 仕上げに Playwright で 5A/5B/5C の画面確認（トグルON・クリック・ランキング開閉）を行い、スクリーンショットを撮る
- README の機能一覧に3機能を追記
- 実APIコード（XPT002 のプロパティ名、用途地域の XKT番号）が未確認の箇所は、コード内コメントと README の「実API接続について」に追記する
