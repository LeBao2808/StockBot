"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HotStock } from "@/lib/dnse-board";
import { useTradingInterval } from "@/lib/market-hours";

type Tab = "value" | "gainers" | "losers" | "volume";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "value", label: "Giá trị GD", hint: "Tiền vào nhiều nhất" },
  { id: "gainers", label: "Tăng mạnh", hint: "% tăng so với phiên trước" },
  { id: "losers", label: "Giảm mạnh", hint: "% giảm so với phiên trước" },
  { id: "volume", label: "KL đột biến", hint: "KL so với trung bình 20 phiên" },
];

const SHOWN = 10;
const price = (value: number) =>
  new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1000);
const billions = (value: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value / 1e9)} tỷ`;
const percent = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2).replace(".", ",")}%`;

function rank(stocks: HotStock[], tab: Tab) {
  const list = [...stocks];
  if (tab === "value") list.sort((a, b) => b.value - a.value);
  if (tab === "gainers") list.sort((a, b) => b.changePercent - a.changePercent);
  if (tab === "losers") list.sort((a, b) => a.changePercent - b.changePercent);
  if (tab === "volume") list.sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0));
  return list.slice(0, SHOWN);
}

/**
 * "Hottest" = the stock with the most money flowing in, among those also
 * trading at least 1.5× their usual volume; falls back to the top by value.
 */
function hottest(stocks: HotStock[]) {
  const byValue = [...stocks].sort((a, b) => b.value - a.value);
  return byValue.find((stock) => (stock.volumeRatio ?? 0) >= 1.5) ?? byValue[0] ?? null;
}

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const span = Math.max(...closes) - min || 1;
  const points = closes
    .map((value, index) => `${((index / (closes.length - 1)) * 100).toFixed(1)},${(28 - ((value - min) / span) * 26).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={closes.at(-1)! >= closes[0] ? "#2e9c6a" : "#d65b4a"}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HotStocks() {
  const [data, setData] = useState<{ session: string | null; stocks: HotStock[] } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("value");
  const [tick, setTick] = useState(0);
  useTradingInterval(() => setTick((value) => value + 1), 60_000);

  useEffect(() => {
    let active = true;
    fetch("/api/market/hot", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Không tải được dữ liệu thị trường.");
        if (active) {
          setData(body);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không kết nối được DNSE.");
      });
    return () => {
      active = false;
    };
  }, [tick]);

  const top = useMemo(() => (data ? hottest(data.stocks) : null), [data]);
  const rows = useMemo(() => (data ? rank(data.stocks, tab) : []), [data, tab]);
  const sessionLabel = data?.session ? data.session.split("-").reverse().join("/") : "";

  return (
    <section className="hot-section" aria-labelledby="hot-title">
      <div className="section-title">
        <h2 id="hot-title">🔥 Cổ phiếu hot hôm nay</h2>
        <p>
          VN100 + HNX30{sessionLabel && ` · phiên ${sessionLabel}`} · nguồn DNSE
        </p>
      </div>
      {error && !data && (
        <div className="api-alert" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      <div className="hot-layout">
        <Link className={`panel hot-spotlight ${top ? "" : "is-loading"}`} href={top ? `/stock/${top.symbol}` : "#"}>
          {top ? (
            <>
              <span className="hot-eyebrow">NÓNG NHẤT PHIÊN</span>
              <div className="hot-symbol">
                <strong>{top.symbol}</strong>
                <span className="exchange-badge">{top.exchange}</span>
              </div>
              <p className="hot-name">{top.name}</p>
              <div className="hot-price">
                <strong>{price(top.price)}</strong>
                <span className={top.changePercent >= 0 ? "stock-change up" : "stock-change down"}>
                  {percent(top.changePercent)}
                </span>
              </div>
              <div className="hot-facts">
                <span>
                  Giá trị GD <b>{billions(top.value)}</b>
                </span>
                <span>
                  KL so với TB 20 phiên{" "}
                  <b>{top.volumeRatio !== null ? `${top.volumeRatio.toFixed(1).replace(".", ",")}×` : "—"}</b>
                </span>
              </div>
              <div className="hot-spark">
                <Sparkline closes={top.closes} />
              </div>
              <span className="hot-cta">Xem biểu đồ →</span>
            </>
          ) : (
            <span className="muted">{error ? "Chưa có dữ liệu." : "Đang quét 130 mã…"}</span>
          )}
        </Link>

        <div className="panel hot-table-panel">
          <div className="tabs hot-tabs" role="tablist" aria-label="Xếp hạng">
            {TABS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "tab active-tab" : "tab"}
                onClick={() => setTab(item.id)}
                title={item.hint}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="table-scroll">
            <table className="hot-table">
              <thead>
                <tr>
                  <th>MÃ</th>
                  <th className="align-right">GIÁ</th>
                  <th className="align-right">+/−</th>
                  <th className="align-right">GIÁ TRỊ GD</th>
                  <th className="align-right">KL / TB20</th>
                  <th>20 PHIÊN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((stock) => (
                  <tr key={stock.symbol}>
                    <td>
                      <Link className="stock-link hot-row-symbol" href={`/stock/${stock.symbol}`}>
                        <strong>{stock.symbol}</strong>
                        <small>{stock.exchange}</small>
                      </Link>
                    </td>
                    <td className="align-right value-cell">{price(stock.price)}</td>
                    <td className="align-right">
                      <span className={stock.changePercent >= 0 ? "stock-change up" : "stock-change down"}>
                        {percent(stock.changePercent)}
                      </span>
                    </td>
                    <td className="align-right">{billions(stock.value)}</td>
                    <td className="align-right">
                      {stock.volumeRatio !== null ? `${stock.volumeRatio.toFixed(1).replace(".", ",")}×` : "—"}
                    </td>
                    <td className="sparkline-cell">
                      <Sparkline closes={stock.closes} />
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className="empty-state" colSpan={6}>
                      {error ? error : "Đang tải…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
