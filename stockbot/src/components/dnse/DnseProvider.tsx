"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { useTradingInterval } from "@/lib/market-hours";

export type DnseSource = "DNSE" | "MOCK";

type ApiPosition = {
  id: string;
  accountNo: string;
  symbol: string;
  status: string;
  quantity: number;
  availableQuantity: number;
  costPrice: number;
  marketPrice: number | null;
  breakEvenPrice: number | null;
  openedAt: string | null;
};

type ApiCash = {
  accountNo: string;
  totalCash: number;
  availableCash: number;
  withdrawableCash: number;
  totalDebt: number;
  orderSecured: number;
  cashDividendReceiving: number;
};

export type DnsePositionView = ApiPosition & {
  /** Latest matched price, falling back to DNSE's position market price, then cost. */
  price: number;
  priceIsLive: boolean;
  costValue: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  /** Share of total stock market value, 0–100. */
  weight: number;
};

type LoadResult = {
  source: DnseSource | null;
  positions: ApiPosition[];
  cash: ApiCash[];
  livePrices: Record<string, number>;
  error: string;
  fetchedAt: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không kết nối được DNSE.");
  return data as T;
}

async function loadLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const quotes = await Promise.all(
    [...new Set(symbols)].map(async (symbol) => {
      try {
        const data = await getJson<{ quote?: { price?: number } }>(`/api/market/quote/${encodeURIComponent(symbol)}`);
        const price = Number(data.quote?.price);
        return Number.isFinite(price) && price > 0 ? ([symbol, price] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(quotes.filter((quote) => quote !== null));
}

async function loadAccount(): Promise<LoadResult> {
  const [positionData, cashData] = await Promise.all([
    getJson<{ source: DnseSource; positions: ApiPosition[]; fetchedAt: string }>("/api/dnse/positions"),
    getJson<{ source: DnseSource; accounts: ApiCash[] }>("/api/dnse/balances"),
  ]);
  return {
    source: positionData.source,
    positions: positionData.positions,
    cash: cashData.accounts,
    livePrices: await loadLivePrices(positionData.positions.map((item) => item.symbol)),
    error: "",
    fetchedAt: positionData.fetchedAt,
  };
}

function useDnseState() {
  const [result, setResult] = useState<LoadResult | null>(null);
  const [requestId, setRequestId] = useState(0);
  const [loadedId, setLoadedId] = useState(-1);
  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    loadAccount()
      .catch(
        (error: unknown): LoadResult => ({
          source: null,
          positions: [],
          cash: [],
          livePrices: {},
          error: error instanceof Error ? error.message : "Không kết nối được DNSE.",
          fetchedAt: null,
        }),
      )
      .then((next) => {
        if (!active) return;
        setResult(next);
        setLoadedId(requestId);
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const refresh = useCallback(() => setRequestId((id) => id + 1), []);

  // During the session, re-price held symbols every 10s (positions/cash stay as loaded).
  useTradingInterval(() => {
    const symbols = result?.positions.map((item) => item.symbol) ?? [];
    if (!symbols.length) return;
    loadLivePrices(symbols).then((prices) => {
      if (Object.keys(prices).length)
        setResult((current) => (current ? { ...current, livePrices: { ...current.livePrices, ...prices } } : current));
    });
  });

  const derived = useMemo(() => {
    const raw = result?.positions ?? [];
    const priced = raw.map((item) => {
      const live = result?.livePrices[item.symbol];
      const price = live ?? item.marketPrice ?? item.costPrice;
      const costValue = item.quantity * item.costPrice;
      const marketValue = item.quantity * price;
      return {
        ...item,
        price,
        priceIsLive: live !== undefined,
        costValue,
        marketValue,
        pnl: marketValue - costValue,
        pnlPercent: costValue > 0 ? ((marketValue - costValue) / costValue) * 100 : 0,
        weight: 0,
      };
    });
    const stockValue = priced.reduce((sum, item) => sum + item.marketValue, 0);
    const costValue = priced.reduce((sum, item) => sum + item.costValue, 0);
    const positions: DnsePositionView[] = priced
      .map((item) => ({ ...item, weight: stockValue > 0 ? (item.marketValue / stockValue) * 100 : 0 }))
      .sort((a, b) => b.marketValue - a.marketValue);
    const cash = (result?.cash ?? []).reduce((sum, item) => sum + item.totalCash, 0);
    const availableCash = (result?.cash ?? []).reduce((sum, item) => sum + item.availableCash, 0);
    const debt = (result?.cash ?? []).reduce((sum, item) => sum + item.totalDebt, 0);
    const pnl = stockValue - costValue;
    return {
      positions,
      stockValue,
      costValue,
      cash,
      availableCash,
      debt,
      netAssets: cash + stockValue - debt,
      pnl,
      pnlPercent: costValue > 0 ? (pnl / costValue) * 100 : 0,
    };
  }, [result]);

  return {
    ...derived,
    source: result?.source ?? null,
    error: result?.error ?? "",
    fetchedAt: result?.fetchedAt ?? null,
    loading,
    refresh,
    positionFor: (symbol: string) => derived.positions.find((item) => item.symbol === symbol),
  };
}

type DnseState = ReturnType<typeof useDnseState>;

const DnseContext = createContext<DnseState | null>(null);

/** Read-only DNSE (Entrade X) positions and cash, shared across pages. */
export function DnseProvider({ children }: { children: React.ReactNode }) {
  const state = useDnseState();
  return <DnseContext value={state}>{children}</DnseContext>;
}

export function useDnse() {
  const state = use(DnseContext);
  if (!state) throw new Error("useDnse phải nằm trong DnseProvider.");
  return state;
}
