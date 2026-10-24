"use client";

import { useEffect, useState } from "react";
import { CandleChart, type Candle } from "@/components/charts/CandleChart";
import { DnseSourceBadge } from "@/components/dnse/DnsePortfolio";
import { useDnse } from "@/components/dnse/DnseProvider";
import { usePortfolio } from "@/components/portfolio/PortfolioProvider";
import { money } from "@/lib/format";

const INDEX_SYMBOLS = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "VN100", "VNXALL"]);

type Snapshot = {
  symbol: string;
  price: number;
  previousClose: number | null;
  high: number;
  low: number;
  volume: number;
  tradeTime: string | null;
};

const points = (value: number) =>
  new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const volumeFormat = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

/** Latest daily candles plus the last matched trade, for the header strip. */
function useSnapshot(symbol: string, type: "STOCK" | "INDEX") {
  const [result, setResult] = useState<{ symbol: string; snapshot: Snapshot | null; error: string }>({
    symbol: "",
    snapshot: null,
    error: "",
  });

  useEffect(() => {
    let active = true;
    const from = Math.floor(Date.now() / 1000) - 20 * 86_400;
    const candlesRequest = fetch(
      `/api/market/ohlc/${encodeURIComponent(symbol)}?resolution=1D&type=${type}&from=${from}`,
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được giá.");
      return data.candles as Candle[];
    });
    // Latest-trade endpoint only exists for tradable symbols.
    const quoteRequest =
      type === "STOCK"
        ? fetch(`/api/market/quote/${encodeURIComponent(symbol)}`)
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => (data?.quote as { price: number; timestamp: string | null } | undefined) ?? null)
            .catch(() => null)
        : Promise.resolve(null);

    Promise.all([candlesRequest, quoteRequest])
      .then(([candles, quote]) => {
        if (!active) return;
        const last = candles.at(-1);
        if (!last) throw new Error(`DNSE chưa có dữ liệu giá cho mã ${symbol}.`);
        setResult({
          symbol,
          error: "",
          snapshot: {
            symbol,
            price: quote?.price ?? last.close,
            previousClose: candles.at(-2)?.close ?? null,
            high: last.high,
            low: last.low,
            volume: last.volume,
            tradeTime: quote?.timestamp ?? null,
          },
        });
      })
      .catch((error: unknown) => {
        if (active)
          setResult({
            symbol,
            snapshot: null,
            error: error instanceof Error ? error.message : "Không kết nối được DNSE.",
          });
      });
    return () => {
      active = false;
    };
  }, [symbol, type]);

  return { ...result, loading: result.symbol !== symbol };
}

export function StockDetail({ symbol }: { symbol: string }) {
  const type = INDEX_SYMBOLS.has(symbol) ? "INDEX" : "STOCK";
  const format = type === "STOCK" ? money : points;
  const { snapshot, error, loading } = useSnapshot(symbol, type);
  const { holdings } = usePortfolio();
  const { positionFor } = useDnse();
  // DNSE (Entrade X) is the source of truth; fall back to the manual portfolio.
  const dnsePosition = type === "STOCK" ? positionFor(symbol) : undefined;
  const manual =
    type === "STOCK" && !dnsePosition
      ? holdings.find((item) => item.ticker === symbol && item.currency === "VND")
      : undefined;
  const holding = dnsePosition
    ? { shares: dnsePosition.quantity, price: dnsePosition.costPrice, source: "DNSE" as const }
    : manual
      ? { shares: manual.shares, price: manual.price, source: "MANUAL" as const }
      : undefined;

  const change =
    snapshot?.previousClose != null ? snapshot.price - snapshot.previousClose : null;
  const changePercent =
    change != null && snapshot?.previousClose ? (change / snapshot.previousClose) * 100 : null;
  const direction = change == null || change === 0 ? "flat" : change > 0 ? "up" : "down";

  const marketPrice = snapshot?.price ?? dnsePosition?.price ?? manual?.currentPrice ?? null;
  const positionValue = holding && marketPrice ? holding.shares * marketPrice : null;
  const positionPnl = holding && marketPrice ? (marketPrice - holding.price) * holding.shares : null;
  const positionPnlPercent =
    holding && marketPrice && holding.price > 0 ? ((marketPrice - holding.price) / holding.price) * 100 : null;

  return (
    <>
      <section className="panel stock-quote" aria-live="polite">
        {loading ? (
          <p className="muted">Đang tải giá {symbol}…</p>
        ) : error || !snapshot ? (
          <p className="us-quote-error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <div className="stock-quote-main">
              <span className="stock-quote-label">
                {type === "INDEX" ? "Chỉ số" : "Giá khớp gần nhất"} · DNSE
              </span>
              <strong>{format(snapshot.price)}</strong>
              {change != null && changePercent != null && (
                <small className={`stock-change ${direction}`}>
                  {change > 0 ? "▲ +" : change < 0 ? "▼ −" : ""}
                  {format(Math.abs(change))} ({change >= 0 ? "+" : "−"}
                  {Math.abs(changePercent).toFixed(2).replace(".", ",")}%)
                </small>
              )}
            </div>
            <div className="stock-quote-stats">
              <span>
                Tham chiếu{" "}
                <strong>{snapshot.previousClose != null ? format(snapshot.previousClose) : "—"}</strong>
              </span>
              <span>
                Cao nhất <strong>{format(snapshot.high)}</strong>
              </span>
              <span>
                Thấp nhất <strong>{format(snapshot.low)}</strong>
              </span>
              <span>
                Khối lượng <strong>{volumeFormat(snapshot.volume)}</strong>
              </span>
            </div>
            {snapshot.tradeTime && (
              <small className="us-quote-time">
                Khớp lúc{" "}
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "medium",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(snapshot.tradeTime))}
              </small>
            )}
          </>
        )}
      </section>

      <CandleChart symbol={symbol} type={type} costPrice={holding?.price ?? null} />

      {holding && (
        <section className="panel stock-position">
          <div className="panel-heading">
            <div>
              <h2>
                Vị thế của bạn {holding.source === "DNSE" && <DnseSourceBadge />}
              </h2>
              <p>
                {holding.source === "DNSE" ? "Theo tài khoản DNSE" : "Theo danh mục nhập tay"} · đường nét đứt trên biểu
                đồ là giá vốn
              </p>
            </div>
          </div>
          <div className="stock-position-grid">
            <span>
              Số lượng <strong>{volumeFormat(holding.shares)}</strong>
            </span>
            <span>
              Giá vốn TB <strong>{money(holding.price)}</strong>
            </span>
            <span>
              Giá trị hiện tại <strong>{positionValue != null ? money(positionValue) : "—"}</strong>
            </span>
            <span>
              Lãi/lỗ tạm tính{" "}
              {positionPnl != null && positionPnlPercent != null ? (
                <strong className={positionPnl >= 0 ? "profit" : "loss-text"}>
                  {positionPnl >= 0 ? "+" : "−"}
                  {money(Math.abs(positionPnl))} ({positionPnl >= 0 ? "+" : "−"}
                  {Math.abs(positionPnlPercent).toFixed(2).replace(".", ",")}%)
                </strong>
              ) : (
                <strong>—</strong>
              )}
            </span>
          </div>
        </section>
      )}
    </>
  );
}
