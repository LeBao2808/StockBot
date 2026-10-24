"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";
import type { Holding, Market } from "@/lib/types";

type ApiHolding = {
  id: string;
  ticker: string;
  name: string;
  exchange: Market;
  currency?: "VND" | "USD";
  quantity: number;
  averagePrice: number;
};

export type HoldingInput = {
  ticker: string;
  exchange: Market;
  quantity: number;
  averagePrice: number;
};

function toHolding(item: ApiHolding): Holding {
  return {
    id: item.id,
    ticker: item.ticker,
    name: item.name,
    market: item.exchange,
    currency: item.currency ?? (item.exchange === "US" ? "USD" : "VND"),
    shares: item.quantity,
    price: item.averagePrice,
    currentPrice: null,
    change: null,
  };
}

function usePortfolioState() {
  const [capital, setCapital] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  // The holdings snapshot whose price fetch last finished; while it differs
  // from the current holdings and some prices are missing, a fetch is running.
  const [settledHoldings, setSettledHoldings] = useState<Holding[] | null>(
    null,
  );
  const refreshingPrices =
    settledHoldings !== holdings &&
    holdings.some((item) => item.currentPrice === null);

  const invested = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "VND")
        .reduce((sum, item) => sum + item.shares * item.price, 0),
    [holdings],
  );
  const investedUsd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "USD")
        .reduce((sum, item) => sum + item.shares * item.price, 0),
    [holdings],
  );
  const marketValueVnd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "VND")
        .reduce(
          (sum, item) => sum + item.shares * (item.currentPrice ?? item.price),
          0,
        ),
    [holdings],
  );
  const marketValueUsd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "USD")
        .reduce(
          (sum, item) => sum + item.shares * (item.currentPrice ?? item.price),
          0,
        ),
    [holdings],
  );
  const pnlVnd = marketValueVnd - invested;
  const pnlUsd = marketValueUsd - investedUsd;
  const pnlVndPercent = invested ? (pnlVnd / invested) * 100 : 0;
  const pnlUsdPercent = investedUsd ? (pnlUsd / investedUsd) * 100 : 0;
  const cash = Math.max(capital - invested, 0);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Không tải được danh mục.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setCapital(data.portfolio.capital);
        setHoldings(data.holdings.map(toHolding));
      })
      .catch((error: unknown) => {
        if (active)
          setApiError(
            error instanceof Error ? error.message : "Không kết nối được API.",
          );
      })
      .finally(() => {
        if (active) setLoadingPortfolio(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const pending = holdings.filter((item) => item.currentPrice === null);
    if (!pending.length) return;
    let active = true;
    Promise.all(
      pending.map(async (item) => {
        try {
          const path =
            item.market === "US"
              ? `/api/market/us/${encodeURIComponent(item.ticker)}`
              : `/api/market/quote/${encodeURIComponent(item.ticker)}`;
          const response = await fetch(path, { cache: "no-store" });
          if (!response.ok) return null;
          const data = await response.json();
          const price = Number(data.quote?.price);
          return Number.isFinite(price) && price > 0
            ? { id: item.id, price }
            : null;
        } catch {
          return null;
        }
      }),
    )
      .then((quotes) => {
        if (!active) return;
        const available = new Map(
          quotes
            .filter(
              (quote): quote is { id: string; price: number } => quote !== null,
            )
            .map((quote) => [quote.id, quote.price]),
        );
        if (available.size)
          setHoldings((items) =>
            items.map((item) =>
              available.has(item.id)
                ? { ...item, currentPrice: available.get(item.id)! }
                : item,
            ),
          );
      })
      .finally(() => {
        if (active) setSettledHoldings(holdings);
      });
    return () => {
      active = false;
    };
  }, [holdings]);

  /** Creates a holding, or updates `editingId` when given. Returns true on success. */
  async function saveHolding(input: HoldingInput, editingId: string | null) {
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch(
        editingId ? `/api/holdings/${editingId}` : "/api/holdings",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không lưu được cổ phiếu.");
      const saved = toHolding(data.holding);
      if (editingId)
        setHoldings((items) =>
          items.map((holding) => (holding.id === editingId ? saved : holding)),
        );
      else setHoldings((items) => [...items, saved]);
      return true;
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không lưu được cổ phiếu.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveCapital() {
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được vốn.");
      setCapital(data.portfolio.capital);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không lưu được vốn.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteHolding(id: string) {
    setApiError("");
    try {
      const response = await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không xóa được cổ phiếu.");
      setHoldings((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không xóa được cổ phiếu.",
      );
    }
  }

  function refreshHoldingPrices() {
    setHoldings((items) =>
      items.map((item) => ({ ...item, currentPrice: null })),
    );
  }

  return {
    capital,
    setCapital,
    holdings,
    loadingPortfolio,
    saving,
    apiError,
    refreshingPrices,
    invested,
    investedUsd,
    marketValueVnd,
    marketValueUsd,
    pnlVnd,
    pnlUsd,
    pnlVndPercent,
    pnlUsdPercent,
    cash,
    saveHolding,
    saveCapital,
    deleteHolding,
    refreshHoldingPrices,
  };
}

type PortfolioState = ReturnType<typeof usePortfolioState>;

const PortfolioContext = createContext<PortfolioState | null>(null);

/** Loads the manually entered portfolio once and shares it with every page. */
export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const state = usePortfolioState();
  return <PortfolioContext value={state}>{children}</PortfolioContext>;
}

export function usePortfolio() {
  const state = use(PortfolioContext);
  if (!state) throw new Error("usePortfolio phải nằm trong PortfolioProvider.");
  return state;
}
