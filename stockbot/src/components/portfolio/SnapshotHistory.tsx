"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useDnse } from "@/components/dnse/DnseProvider";
import { money } from "@/lib/format";

type Snapshot = {
  id: string;
  capturedAt: string;
  totalValueVnd: number;
  unrealizedPnlVnd: number | null;
  priceSource: string | null;
};

const VN_OFFSET = 7 * 3600;

function HistoryChart({ snapshots }: { snapshots: Snapshot[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const formatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#6f7772", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#f1f4f1" }, horzLines: { color: "#f1f4f1" } },
      rightPriceScale: { borderColor: "#e8ede9" },
      timeScale: { borderColor: "#e8ede9", timeVisible: true },
      localization: { locale: "vi-VN", priceFormatter: (price: number) => formatter.format(price) },
    });
    const line = chart.addSeries(LineSeries, { color: "#28795f", lineWidth: 2 });
    // Several snapshots can land in the same second; keep the last one so times stay strictly increasing.
    const points = new Map<number, number>();
    for (const item of snapshots) {
      points.set(Math.floor(new Date(item.capturedAt).getTime() / 1000) + VN_OFFSET, item.totalValueVnd);
    }
    line.setData([...points].sort(([a], [b]) => a - b).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [snapshots]);

  return <div className="history-chart" ref={containerRef} />;
}

export function SnapshotHistory() {
  const { source, refresh } = useDnse();
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio/snapshots", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được lịch sử tài sản.");
        if (active) setSnapshots(data.snapshots);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSnapshots([]);
        setError(reason instanceof Error ? reason.message : "Không tải được lịch sử tài sản.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function capture() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio/snapshots", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được snapshot.");
      setSnapshots((items) => [...(items ?? []), data.snapshot]);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được snapshot.");
    } finally {
      setSaving(false);
    }
  }

  const latest = snapshots?.at(-1);
  const first = snapshots?.[0];
  const change = latest && first && snapshots.length > 1 ? latest.totalValueVnd - first.totalValueVnd : null;

  return (
    <section className="panel history-panel">
      <div className="pnl-heading">
        <div>
          <h2>Lịch sử tài sản DNSE</h2>
          <p>
            Mỗi lần chụp lưu tài sản ròng (tiền + cổ phiếu theo giá khớp gần nhất − nợ) vào MongoDB
            {source === "MOCK" && " · đang dùng dữ liệu mẫu"}
          </p>
        </div>
        <button className="primary-button" onClick={capture} disabled={saving}>
          {saving ? "Đang chụp…" : "📸 Chụp lại"}
        </button>
      </div>
      {error && (
        <div className="api-alert history-alert" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      {snapshots === null ? (
        <p className="muted history-empty">Đang tải lịch sử…</p>
      ) : snapshots.length ? (
        <>
          <div className="history-stats">
            <span>
              Lần chụp gần nhất <strong>{money(latest!.totalValueVnd)}</strong>
            </span>
            <span>
              Số lần chụp <strong>{snapshots.length}</strong>
            </span>
            {change !== null && (
              <span>
                Thay đổi từ lần đầu{" "}
                <strong className={change >= 0 ? "profit" : "loss-text"}>
                  {change >= 0 ? "+" : "−"}
                  {money(Math.abs(change))}
                </strong>
              </span>
            )}
          </div>
          <HistoryChart snapshots={snapshots} />
        </>
      ) : (
        !error && <p className="muted history-empty">Chưa có snapshot nào. Bấm “Chụp lại” để lưu điểm đầu tiên.</p>
      )}
    </section>
  );
}
