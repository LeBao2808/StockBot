"use client";

import { dollars, money } from "@/lib/format";
import { usePortfolio } from "./PortfolioProvider";

export function OverviewSummary() {
  const { holdings, capital, invested, cash, marketValueVnd, marketValueUsd } =
    usePortfolio();

  return (
    <section className="summary-grid" id="capital">
      <article className="summary-card total-card">
        <div className="card-label">TÀI SẢN ƯỚC TÍNH · VND</div>
        <div className="total-number">{money(cash + marketValueVnd)}</div>
        <div className="total-foot">
          <span className="muted">
            Tiền mặt + cổ phiếu Việt Nam theo giá mới nhất
          </span>
        </div>
      </article>
      <article className="summary-card">
        <div className="card-label">CỔ PHIẾU VIỆT NAM</div>
        <div className="metric-number">{money(marketValueVnd)}</div>
        <div className="allocation-caption">
          <span>
            {holdings.filter((item) => item.currency === "VND").length} mã ·{" "}
            {Math.round((invested / Math.max(capital, 1)) * 100)}% vốn gốc
          </span>
        </div>
        <div className="card-icon violet">◈</div>
      </article>
      <article className="summary-card">
        <div className="card-label">
          TIỀN MẶT CÒN LẠI <button aria-label="Thông tin">ⓘ</button>
        </div>
        <div className="metric-number">{money(cash)}</div>
        <div className="cash-caption">
          <span className="cash-dot" /> Sẵn sàng đầu tư
        </div>
        <div className="card-icon green">↗</div>
      </article>
      <article className="summary-card">
        <div className="card-label">CỔ PHIẾU MỸ · USD</div>
        <div className="metric-number">{dollars(marketValueUsd)}</div>
        <div className="allocation-caption">
          <span>
            {holdings.filter((item) => item.currency === "USD").length} mã ·
            tách riêng khỏi VND
          </span>
        </div>
      </article>
    </section>
  );
}
