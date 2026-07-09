import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import type { HistoryPoint } from "../types";

interface PriceHistoryState {
  data: HistoryPoint[] | null;
  loading: boolean;
  error: string | null;
}

export function usePriceHistory(city: string | null): PriceHistoryState {
  const [state, setState] = useState<PriceHistoryState>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!city) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetchJson<{ city: string; points: HistoryPoint[] }>(
      `/api/price-history?city=${encodeURIComponent(city)}`,
      controller.signal,
    )
      .then((res) => setState({ data: res.points, loading: false, error: null }))
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setState({ data: null, loading: false, error: e.message });
      });
    return () => controller.abort();
  }, [city]);

  return state;
}
