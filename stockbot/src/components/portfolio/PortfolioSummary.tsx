"use client";

import { dollars, money } from "@/lib/format";
import type { Market } from "@/lib/types";
import { usePortfolio } from "./PortfolioProvider";

export function PortfolioSummary() {
  const {
    holdings,
    invested,
    investedUsd,
    cash,
    marketValueVnd,
    marketValueUsd,
  } = usePortfolio();

  return (
    <>
      <section className="summary-grid portfolio-summary">
        <article className="summary-card">
          <div className="card-label">TÀI SẢN VND ƯỚC TÍNH</div>
          <div className="metric-number">{money(cash + marketValueVnd)}</div>
          <div className="total-foot">
            <span className="muted">Tiền mặt + giá trị cổ phiếu</span>
          </div>
        </article>
        <article className="summary-card">
          <div className="card-label">CỔ PHIẾU VND · THEO GIÁ HIỆN TẠI</div>
          <div className="metric-number">{money(marketValueVnd)}</div>
          <div className="allocation-caption">
            <span>Giá vốn {money(invested)}</span>
          </div>
        </article>
        <article className="summary-card">
          <div className="card-label">CỔ PHIẾU MỸ · THEO GIÁ HIỆN TẠI</div>
          <div className="metric-number">{dollars(marketValueUsd)}</div>
          <div className="allocation-caption">
            <span>Giá vốn {dollars(investedUsd)}</span>
          </div>
        </article>
        <article className="summary-card">
          <div className="card-label">TIỀN MẶT VND CÒN LẠI</div>
          <div className="metric-number">{money(cash)}</div>
          <div className="cash-caption">
            <span className="cash-dot" /> Chưa tính tiền mặt USD
          </div>
        </article>
      </section>

      <section className="portfolio-allocation">
        <article className="panel market-panel" id="markets">
          <div className="panel-heading">
            <div>
              <h2>Phân bổ theo sàn</h2>
              <p>Giá trị danh mục của bạn</p>
            </div>
            <button className="more-button" aria-label="Tùy chọn">
              ···
            </button>
          </div>
          <div className="market-content">
            <div className="donut-wrap">
              <div className="donut">
                <div>
                  <strong>{holdings.length}</strong>
                  <small>MÃ CP</small>
                </div>
              </div>
            </div>
            <div className="market-legend">
              {(["HOSE", "HNX", "UPCOM"] as Market[]).map((exchange) => {
                const value = holdings
                  .filter((h) => h.market === exchange)
                  .reduce((sum, h) => sum + h.shares * h.price, 0);
                const pct = invested ? Math.round((value / invested) * 100) : 0;
                return (
                  <div className="legend-row" key={exchange}>
                    <span className={`legend-dot ${exchange.toLowerCase()}`} />
                    <span>{exchange}</span>
                    <strong>{pct}%</strong>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="market-foot">
            <span>⌁</span> Phân bổ danh mục theo từng sàn giao dịch
          </div>
        </article>
      </section>
    </>
  );
}
