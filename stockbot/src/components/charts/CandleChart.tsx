"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTradingInterval } from "@/lib/market-hours";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Timeframe = { resolution: string; label: string };

const TIMEFRAMES: Timeframe[] = [
  { resolution: "1", label: "1 phút" },
  { resolution: "5", label: "5 phút" },
  { resolution: "15", label: "15 phút" },
  { resolution: "1H", label: "1 giờ" },
  { resolution: "1D", label: "Ngày" },
  { resolution: "1W", label: "Tuần" },
];

// lightweight-charts renders timestamps as UTC; shift to Vietnam time (UTC+7).
const VN_OFFSET = 7 * 3600;
const UP = "#2e9c6a";
const DOWN = "#d65b4a";

const toCandle = (item: Candle) => ({
  time: (item.time + VN_OFFSET) as UTCTimestamp,
  open: item.open,
  high: item.high,
  low: item.low,
  close: item.close,
});
const toVolume = (item: Candle) => ({
  time: (item.time + VN_OFFSET) as UTCTimestamp,
  value: item.volume,
  color: item.close >= item.open ? "#2e9c6a55" : "#d65b4a55",
});

type LoadState = {
  key: string;
  candles: Candle[];
  error: string;
};

export function CandleChart({
  symbol,
  type = "STOCK",
  costPrice,
  defaultResolution = "1D",
}: {
  symbol: string;
  type?: "STOCK" | "INDEX" | "DERIVATIVE";
  /** Draws a dashed "Giá vốn" line when the user holds this symbol. */
  costPrice?: number | null;
  defaultResolution?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [resolution, setResolution] = useState(defaultResolution);
  const [state, setState] = useState<LoadState>({ key: "", candles: [], error: "" });
  const lastTimeRef = useRef<number | null>(null);
  const requestKey = `${symbol}|${type}|${resolution}`;
  // Lets a slow live-update response detect that the timeframe changed meanwhile.
  const requestKeyRef = useRef(requestKey);
  useEffect(() => {
    requestKeyRef.current = requestKey;
  }, [requestKey]);
  const loading = state.key !== requestKey;
  const intraday = resolution !== "1D" && resolution !== "1W";

  // Create the chart once per mounted container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const decimals = type === "STOCK" ? 0 : 2;
    const priceFormatter = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#6f7772",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#f1f4f1" },
        horzLines: { color: "#f1f4f1" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e8ede9" },
      timeScale: { borderColor: "#e8ede9", rightOffset: 4 },
      localization: {
        locale: "vi-VN",
        priceFormatter: (price: number) => priceFormatter.format(price),
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.26 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [type]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: intraday, secondsVisible: false },
    });
  }, [intraday]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ resolution, type });
    fetch(`/api/market/ohlc/${encodeURIComponent(symbol)}?${query}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu nến.");
        return data.candles as Candle[];
      })
      .then((candles) => {
        if (active) setState({ key: requestKey, candles, error: "" });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            key: requestKey,
            candles: [],
            error: error instanceof Error ? error.message : "Không kết nối được DNSE.",
          });
      });
    return () => {
      active = false;
    };
  }, [symbol, type, resolution, requestKey]);

  useEffect(() => {
    const candles = candleRef.current;
    const volume = volumeRef.current;
    if (!candles || !volume || loading) return;
    candles.setData(state.candles.map(toCandle));
    volume.setData(state.candles.map(toVolume));
    lastTimeRef.current = state.candles.at(-1)?.time ?? null;
    chartRef.current?.timeScale().fitContent();
  }, [state, loading]);

  // While the market is open, refetch from the last candle and patch it in place.
  useTradingInterval(() => {
    const since = lastTimeRef.current;
    if (since === null || loading) return;
    const key = requestKey;
    const query = new URLSearchParams({
      resolution,
      type,
      from: String(since),
      to: String(Math.floor(Date.now() / 1000) + 60),
    });
    fetch(`/api/market/ohlc/${encodeURIComponent(symbol)}?${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { candles?: Candle[] } | null) => {
        const candles = candleRef.current;
        const volume = volumeRef.current;
        if (!data?.candles || !candles || !volume || key !== requestKeyRef.current) return;
        for (const item of data.candles) {
          if (lastTimeRef.current !== null && item.time < lastTimeRef.current) continue;
          candles.update(toCandle(item));
          volume.update(toVolume(item));
          lastTimeRef.current = item.time;
        }
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    const candles = candleRef.current;
    if (!candles || !costPrice || costPrice <= 0) return;
    const line: IPriceLine = candles.createPriceLine({
      price: costPrice,
      color: "#7667bd",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Giá vốn",
    });
    return () => {
      // Skip when the chart itself was torn down first (e.g. `type` changed).
      if (candleRef.current === candles) candles.removePriceLine(line);
    };
  }, [costPrice, type]);

  return (
    <section className="panel chart-panel" aria-label={`Biểu đồ nến ${symbol}`}>
      <div className="chart-toolbar">
        <div className="tabs" role="tablist" aria-label="Khung thời gian">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.resolution}
              role="tab"
              aria-selected={resolution === item.resolution}
              className={resolution === item.resolution ? "tab active-tab" : "tab"}
              onClick={() => setResolution(item.resolution)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="chart-source">
          {loading ? "Đang tải…" : `${state.candles.length} nến · DNSE`}
        </span>
      </div>
      <div className="chart-canvas">
        {/* The library owns this node's children; React overlays live beside it. */}
        <div className="chart-host" ref={containerRef} />
        {!loading && state.error && (
          <p className="chart-message" role="alert">
            {state.error}
          </p>
        )}
        {!loading && !state.error && !state.candles.length && (
          <p className="chart-message">Chưa có dữ liệu nến cho khung thời gian này.</p>
        )}
      </div>
    </section>
  );
}
