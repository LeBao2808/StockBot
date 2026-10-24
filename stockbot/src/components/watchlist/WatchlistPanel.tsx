"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Candle } from "@/components/charts/CandleChart";
import { money } from "@/lib/format";
import { useTradingInterval } from "@/lib/market-hours";
import { useWatchlist } from "./WatchlistProvider";

type Row = { closes: number[]; price: number; change: number | null; changePercent: number | null };

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <span className="muted">—</span>;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = closes
    .map((value, index) => `${((index / (closes.length - 1)) * 100).toFixed(1)},${(28 - ((value - min) / span) * 26).toFixed(1)}`)
    .join(" ");
  const up = closes.at(-1)! >= closes[0];
  return (
    <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={up ? "#2e9c6a" : "#d65b4a"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

async function loadRow(symbol: string): Promise<Row | null> {
  const from = Math.floor(Date.now() / 1000) - 45 * 86_400;
  const response = await fetch(`/api/market/ohlc/${encodeURIComponent(symbol)}?resolution=1D&from=${from}`);
  if (!response.ok) return null;
  const candles = ((await response.json()).candles ?? []) as Candle[];
  const last = candles.at(-1);
  if (!last) return null;
  const previous = candles.at(-2)?.close ?? null;
  return {
    closes: candles.slice(-30).map((item) => item.close),
    price: last.close,
    change: previous !== null ? last.close - previous : null,
    changePercent: previous ? ((last.close - previous) / previous) * 100 : null,
  };
}

export function WatchlistPanel() {
  const { symbols, loaded, error, busy, add, remove } = useWatchlist();
  const [rows, setRows] = useState<Record<string, Row | null>>({});
  const [input, setInput] = useState("");
  const [tick, setTick] = useState(0);
  useTradingInterval(() => setTick((value) => value + 1), 15_000);

  useEffect(() => {
    let active = true;
    Promise.all(symbols.map(async (symbol) => [symbol, await loadRow(symbol).catch(() => null)] as const)).then(
      (entries) => {
        if (active) setRows(Object.fromEntries(entries));
      },
    );
    return () => {
      active = false;
    };
  }, [symbols, tick]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = input.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(symbol)) return;
    setInput("");
    add(symbol);
  }

  return (
    <section className="panel watchlist-panel" aria-labelledby="watchlist-title">
      <div className="holdings-heading">
        <div>
          <h2 id="watchlist-title">Danh sách theo dõi</h2>
          <p>Giá đóng cửa/khớp gần nhất từ DNSE, biểu đồ nhỏ 30 phiên</p>
        </div>
        <form className="watchlist-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="watch-symbol">
            Thêm mã theo dõi
          </label>
          <input
            id="watch-symbol"
            value={input}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            placeholder="Thêm mã, ví dụ VNM"
            maxLength={12}
            autoComplete="off"
          />
          <button className="text-button" type="submit" disabled={busy}>
            ＋ Theo dõi
          </button>
        </form>
      </div>
      {error && (
        <div className="api-alert watchlist-alert" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>MÃ</th>
              <th className="align-right">GIÁ</th>
              <th className="align-right">THAY ĐỔI</th>
              <th>30 PHIÊN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {symbols.map((symbol) => {
              const row = rows[symbol];
              const up = (row?.change ?? 0) >= 0;
              return (
                <tr key={symbol}>
                  <td>
                    <Link className="stock-name stock-link" href={`/stock/${symbol}`}>
                      <span className={`stock-logo logo-${symbol.toLowerCase()}`}>{symbol.slice(0, 1)}</span>
                      <strong>{symbol}</strong>
                    </Link>
                  </td>
                  <td className="align-right value-cell">{row ? money(row.price) : row === null ? "—" : "…"}</td>
                  <td className="align-right">
                    {row?.change != null && row.changePercent != null ? (
                      <span className={`stock-change ${up ? "up" : "down"}`}>
                        {up ? "▲ +" : "▼ −"}
                        {Math.abs(row.changePercent).toFixed(2).replace(".", ",")}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="sparkline-cell">{row ? <Sparkline closes={row.closes} /> : null}</td>
                  <td className="actions-cell">
                    <button
                      className="row-menu delete-menu"
                      aria-label={`Bỏ theo dõi ${symbol}`}
                      title={`Bỏ theo dõi ${symbol}`}
                      onClick={() => remove(symbol)}
                      disabled={busy}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {!symbols.length && (
              <tr>
                <td className="empty-state" colSpan={5}>
                  {loaded ? "Chưa theo dõi mã nào. Thêm mã ở ô bên trên." : "Đang tải…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function WatchButton({ symbol }: { symbol: string }) {
  const { has, add, remove, busy, loaded } = useWatchlist();
  const watching = has(symbol);
  return (
    <button
      className={watching ? "text-button" : "primary-button"}
      onClick={() => (watching ? remove(symbol) : add(symbol))}
      disabled={busy || !loaded}
    >
      {watching ? "★ Đang theo dõi" : "☆ Theo dõi"}
    </button>
  );
}
