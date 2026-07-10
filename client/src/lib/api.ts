export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // JSONでないエラーボディはステータスのみで報告
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
