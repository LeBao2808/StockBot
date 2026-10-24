"use client";

import { dollars, money } from "@/lib/format";
import type { HoldingForm } from "./HoldingModal";
import { usePortfolio } from "./PortfolioProvider";

export function HoldingsTable({ form }: { form: HoldingForm }) {
  const {
    holdings,
    loadingPortfolio,
    refreshingPrices,
    refreshHoldingPrices,
    deleteHolding,
  } = usePortfolio();
  const { market, setMarket } = form;
  const visibleHoldings =
    market === "Tất cả"
      ? holdings
      : holdings.filter((item) => item.market === market);

  return (
    <section className="panel holdings-panel" id="holdings">
      <div className="holdings-heading">
        <div>
          <h2>Cổ phiếu của bạn</h2>
          <p>Giá thị trường được tải tự động; VND và USD hiển thị riêng</p>
        </div>
        <button className="text-button" onClick={form.openNew}>
          ＋ Thêm mã mới
        </button>
      </div>
      <div className="table-toolbar">
        <div className="tabs">
          {(["Tất cả", "HOSE", "HNX", "UPCOM", "US"] as const).map((item) => (
            <button
              key={item}
              className={market === item ? "tab active-tab" : "tab"}
              onClick={() => setMarket(item)}
            >
              {item}
              {item === "Tất cả" && <span>{holdings.length}</span>}
            </button>
          ))}
        </div>
        <button
          className="filter-button"
          onClick={refreshHoldingPrices}
          disabled={refreshingPrices}
        >
          {refreshingPrices ? "Đang tải giá…" : "↻ Cập nhật giá"}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>MÃ CỔ PHIẾU</th>
              <th>SÀN</th>
              <th className="align-right">SỐ LƯỢNG</th>
              <th className="align-right">GIÁ VỐN TB</th>
              <th className="align-right">GIÁ HIỆN TẠI</th>
              <th className="align-right">GIÁ TRỊ HIỆN TẠI</th>
              <th className="align-right">LÃI/LỖ TẠM TÍNH</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleHoldings.length ? (
              visibleHoldings.map((item) => {
                const current = item.currentPrice ?? item.price;
                const pnl = (current - item.price) * item.shares;
                const pnlPercent =
                  item.price > 0
                    ? ((current - item.price) / item.price) * 100
                    : 0;
                const format = item.currency === "USD" ? dollars : money;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="stock-name">
                        <span
                          className={`stock-logo logo-${item.ticker.toLowerCase()}`}
                        >
                          {item.ticker.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{item.ticker}</strong>
                          <small>{item.name}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`exchange-badge ${item.market.toLowerCase()}`}
                      >
                        {item.market}
                      </span>
                    </td>
                    <td className="align-right">
                      {new Intl.NumberFormat("vi-VN").format(item.shares)}
                    </td>
                    <td className="align-right">{format(item.price)}</td>
                    <td className="align-right">
                      {item.currentPrice === null ? (
                        <span className="muted">Đang tải…</span>
                      ) : (
                        format(current)
                      )}
                    </td>
                    <td className="align-right value-cell">
                      {format(current * item.shares)}
                    </td>
                    <td className="align-right">
                      {item.currentPrice === null ? (
                        <span className="pnl-badge pnl-pending">
                          Đang cập nhật
                        </span>
                      ) : (
                        <span
                          className={`pnl-badge ${pnl >= 0 ? "pnl-positive" : "pnl-negative"}`}
                        >
                          <strong>
                            {pnl >= 0 ? "+" : "−"}
                            {format(Math.abs(pnl))}
                          </strong>
                          <small>
                            {pnl >= 0 ? "▲" : "▼"}{" "}
                            {Math.abs(pnlPercent).toFixed(2).replace(".", ",")}%
                          </small>
                        </span>
                      )}
                    </td>
                    <td className="actions-cell">
                      <button
                        className="row-menu edit-action"
                        aria-label={`Sửa ${item.ticker}`}
                        title={`Sửa ${item.ticker}`}
                        onClick={() => form.openEdit(item)}
                      >
                        <span aria-hidden="true">✎</span>
                        <span className="action-label">Sửa</span>
                      </button>
                      <button
                        className="row-menu delete-menu"
                        aria-label={`Xóa ${item.ticker}`}
                        title={`Xóa ${item.ticker}`}
                        onClick={() => deleteHolding(item.id)}
                      >
                        <span aria-hidden="true">×</span>
                        <span className="action-label">Xóa</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="empty-state" colSpan={8}>
                  {loadingPortfolio
                    ? "Đang tải danh mục…"
                    : "Chưa có mã cổ phiếu trên sàn này."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Đang hiển thị <strong>{visibleHoldings.length}</strong> /{" "}
          {holdings.length} mã
        </span>
        <button onClick={form.openNew}>
          Thêm mã <span>＋</span>
        </button>
      </div>
    </section>
  );
}
