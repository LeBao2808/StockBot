"use client";

import { dollars, money } from "@/lib/format";
import { usePortfolio } from "./PortfolioProvider";

export function PerformanceSection() {
  const {
    cash,
    marketValueVnd,
    marketValueUsd,
    pnlVnd,
    pnlUsd,
    pnlVndPercent,
    pnlUsdPercent,
    refreshingPrices,
    refreshHoldingPrices,
  } = usePortfolio();

  return (
    <>
      <section className="panel pnl-panel">
        <div className="pnl-heading">
          <div>
            <h2>Tổng hợp lãi/lỗ</h2>
            <p>
              Giá trị ước tính theo giá DNSE/Finnhub tải gần nhất; USD và VND
              được giữ riêng.
            </p>
          </div>
        </div>
        <div className="pnl-grid">
          <article className="pnl-card pnl-main">
            <span>TÀI SẢN ƯỚC TÍNH · VND</span>
            <strong>
              {new Intl.NumberFormat("vi-VN").format(cash + marketValueVnd)}{" "}
              <small>₫</small>
            </strong>
            <p>Tiền mặt VND + cổ phiếu Việt Nam</p>
          </article>
          <article className="pnl-card">
            <span>CỔ PHIẾU · USD</span>
            <strong>
              {dollars(marketValueUsd)} <small>USD</small>
            </strong>
            <p>Không quy đổi sang VND</p>
          </article>
          <article className="pnl-card">
            <span>LỜI/LỖ CỔ PHIẾU · VND</span>
            <strong className={pnlVnd >= 0 ? "profit" : "loss"}>
              {pnlVnd >= 0 ? "+" : "−"}
              {money(Math.abs(pnlVnd))}
            </strong>
            <p className={pnlVnd >= 0 ? "profit" : "loss-text"}>
              {pnlVndPercent.toFixed(2)}%
            </p>
          </article>
          <article className="pnl-card">
            <span>LỜI/LỖ CỔ PHIẾU · USD</span>
            <strong className={pnlUsd >= 0 ? "profit" : "loss"}>
              {pnlUsd >= 0 ? "+" : "−"}
              {dollars(Math.abs(pnlUsd))}
            </strong>
            <p className={pnlUsd >= 0 ? "profit" : "loss-text"}>
              {pnlUsdPercent.toFixed(2)}%
            </p>
          </article>
        </div>
        <div className="pnl-actions">
          <button
            className="primary-button"
            onClick={refreshHoldingPrices}
            disabled={refreshingPrices}
          >
            {refreshingPrices ? "Đang cập nhật giá…" : "Cập nhật giá mới nhất"}
          </button>
        </div>
      </section>

      <section className="panel yearly-panel">
        <div className="yearly-heading">
          <div>
            <h2>
              Hiệu suất theo năm &amp; lũy kế <span>(all-time)</span>
            </h2>
            <p>
              Bảng minh họa giao diện; số liệu lịch sử chưa được tính từ giao
              dịch đã lưu.
            </p>
          </div>
          <span className="demo-badge">DỮ LIỆU MẪU</span>
        </div>
        <div className="yearly-scroll">
          <table className="yearly-table">
            <thead>
              <tr>
                <th>NĂM</th>
                <th>VỐN TÍCH LŨY</th>
                <th>GIÁ TRỊ HIỆN TẠI</th>
                <th>LỜI/LỖ TRONG NĂM</th>
                <th>LỜI/LỖ LŨY KẾ (ALL-TIME)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2024</td>
                <td>
                  7.670.000 VND
                  <br />
                  <span>295,00 USD</span>
                </td>
                <td>
                  11.900.000 VND
                  <br />
                  <span>476,00 USD</span>
                </td>
                <td className="profit">
                  4.230.000 VND (55,15%)
                  <br />
                  <span>181,00 USD (61,36%)</span>
                </td>
                <td className="profit">0 VND (0,00%)</td>
              </tr>
              <tr>
                <td>2025</td>
                <td>
                  26.506.000 VND
                  <br />
                  <span>1.043,96 USD</span>
                </td>
                <td>
                  30.458.792 VND
                  <br />
                  <span>1.132,09 USD</span>
                </td>
                <td className="loss-text">
                  −277.208 VND (−0,90%)
                  <br />
                  <span>−92,87 USD (−7,58%)</span>
                </td>
                <td className="profit">3.952.792 VND (14,91%)</td>
              </tr>
              <tr className="current-year">
                <td>2026</td>
                <td>
                  26.506.000 VND
                  <br />
                  <span>1.043,96 USD</span>
                </td>
                <td>
                  22.601.645 VND
                  <br />
                  <span>871,44 USD</span>
                </td>
                <td className="loss-text">
                  −3.904.355 VND (−14,73%)
                  <br />
                  <span>−172,52 USD (−16,53%)</span>
                </td>
                <td className="loss-text">−3.904.355 VND (−14,73%)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
