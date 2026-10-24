"use client";

import { useState } from "react";
import { dollars } from "@/lib/format";
import type { UsQuote } from "@/lib/types";

export function UsStockLookup() {
  const [usSymbol, setUsSymbol] = useState("");
  const [usQuote, setUsQuote] = useState<UsQuote | null>(null);
  const [usQuoteError, setUsQuoteError] = useState("");
  const [usQuoteBusy, setUsQuoteBusy] = useState(false);

  async function lookupUsStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = usSymbol.trim().toUpperCase();
    if (!symbol || usQuoteBusy) return;
    setUsQuoteBusy(true);
    setUsQuoteError("");
    setUsQuote(null);
    try {
      const response = await fetch(
        `/api/market/us/${encodeURIComponent(symbol)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không tra cứu được mã cổ phiếu.");
      setUsQuote(data.quote);
    } catch (error) {
      setUsQuoteError(
        error instanceof Error ? error.message : "Không kết nối được Finnhub.",
      );
    } finally {
      setUsQuoteBusy(false);
    }
  }

  return (
    <section className="panel us-market-panel" aria-labelledby="us-market-title">
      <div className="us-market-heading">
        <div>
          <span className="us-market-eyebrow">THỊ TRƯỜNG QUỐC TẾ</span>
          <h2 id="us-market-title">Tra cứu cổ phiếu Mỹ</h2>
          <p>
            Nhập mã niêm yết như AAPL, MSFT hoặc NVDA để xem báo giá bằng USD.
          </p>
        </div>
        <span className="finnhub-mark">US</span>
      </div>
      <form className="us-lookup-form" onSubmit={lookupUsStock}>
        <label className="sr-only" htmlFor="us-symbol">
          Mã cổ phiếu Mỹ
        </label>
        <input
          id="us-symbol"
          value={usSymbol}
          onChange={(event) => setUsSymbol(event.target.value.toUpperCase())}
          placeholder="Nhập mã, ví dụ AAPL"
          maxLength={10}
          required
        />
        <button className="primary-button" type="submit" disabled={usQuoteBusy}>
          {usQuoteBusy ? "Đang tra cứu…" : "Tra cứu giá →"}
        </button>
      </form>
      {usQuoteError && (
        <p className="us-quote-error" role="alert">
          {usQuoteError}
        </p>
      )}
      {usQuote && (
        <div className="us-quote-card">
          <div className="us-quote-main">
            <span>{usQuote.symbol} · USD · Finnhub</span>
            <strong>{dollars(usQuote.price)}</strong>
            <small
              className={
                usQuote.change >= 0 ? "quote-positive" : "quote-negative"
              }
            >
              {usQuote.change >= 0 ? "+" : ""}
              {dollars(usQuote.change)} (
              {usQuote.changePercent >= 0 ? "+" : ""}
              {usQuote.changePercent.toFixed(2)}%) so với giá đóng cửa trước
            </small>
          </div>
          <div className="us-quote-stats">
            <span>
              Cao nhất hôm nay <strong>{dollars(usQuote.high)}</strong>
            </span>
            <span>
              Thấp nhất hôm nay <strong>{dollars(usQuote.low)}</strong>
            </span>
            <span>
              Mở cửa <strong>{dollars(usQuote.open)}</strong>
            </span>
            <span>
              Đóng cửa trước <strong>{dollars(usQuote.previousClose)}</strong>
            </span>
          </div>
          <small className="us-quote-time">
            {usQuote.timestamp
              ? `Thời điểm Finnhub: ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(usQuote.timestamp))} (giờ New York)`
              : "Finnhub chưa trả timestamp cho báo giá này."}
          </small>
        </div>
      )}
      <div className="us-market-foot">
        Giá tùy thuộc quyền truy cập và độ trễ của gói Finnhub. API key được giữ
        ở máy chủ.
      </div>
    </section>
  );
}
