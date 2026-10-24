"use client";

import { createContext, use, useEffect, useState } from "react";

type WatchlistState = {
  symbols: string[];
  loaded: boolean;
  error: string;
  busy: boolean;
  has: (symbol: string) => boolean;
  add: (symbol: string) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
};

const WatchlistContext = createContext<WatchlistState | null>(null);

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không cập nhật được danh sách theo dõi.");
  return data;
}

/** Watched symbols stored in MongoDB, shared by the markets page and the stock page's follow button. */
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    send("/api/watchlist", { cache: "no-store" })
      .then((data: { items: Array<{ symbol: string }> }) => {
        if (active) setSymbols(data.items.map((item) => item.symbol));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được danh sách theo dõi.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không cập nhật được danh sách theo dõi.");
    } finally {
      setBusy(false);
    }
  }

  const state: WatchlistState = {
    symbols,
    loaded,
    error,
    busy,
    has: (symbol) => symbols.includes(symbol),
    add: (symbol) =>
      mutate(async () => {
        await send("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        setSymbols((items) => (items.includes(symbol) ? items : [...items, symbol]));
      }),
    remove: (symbol) =>
      mutate(async () => {
        await send(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
        setSymbols((items) => items.filter((item) => item !== symbol));
      }),
  };

  return <WatchlistContext value={state}>{children}</WatchlistContext>;
}

export function useWatchlist() {
  const state = use(WatchlistContext);
  if (!state) throw new Error("useWatchlist phải nằm trong WatchlistProvider.");
  return state;
}
