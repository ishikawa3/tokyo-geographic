import { gunzipSync } from "node:zlib";

const BASE_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const TIMEOUT_MS = 15_000;

/** 上流(reinfolib)エラーを、クライアントへ返すHTTPステータスに変換して運ぶ */
export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * reinfolib API を呼ぶ。認証・タイムアウト・gzipフォールバックを面倒みる。
 * レスポンスは gzip 圧縮されており、通常 fetch が自動解凍するが、
 * Content-Encoding ヘッダーが欠けるケースに備えマジックバイト(1f 8b)で判定して手動解凍する。
 */
export async function fetchReinfolib(code: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) {
    throw new UpstreamError(500, "REINFOLIB_API_KEY is not set");
  }

  const url = new URL(`${BASE_URL}/${code}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new UpstreamError(504, `reinfolib request timed out (${code})`);
    }
    throw new UpstreamError(502, `reinfolib request failed (${code}): ${String(e)}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new UpstreamError(502, "reinfolib auth failed. Check REINFOLIB_API_KEY.");
  }
  if (res.status === 429) {
    throw new UpstreamError(429, "reinfolib rate limit exceeded", res.headers.get("Retry-After") ?? undefined);
  }
  if (res.status === 404) {
    throw new UpstreamError(404, `reinfolib returned 404 (${code})`);
  }
  if (!res.ok) {
    throw new UpstreamError(502, `reinfolib returned ${res.status} (${code})`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  let text: string;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    text = gunzipSync(buf).toString("utf-8");
  } else {
    text = new TextDecoder("utf-8").decode(buf);
  }
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(502, `reinfolib returned non-JSON response (${code})`);
  }
}

/** 同時実行数を制限して Promise を実行する（reinfolib への負荷抑制、最大4並列） */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
