"use client";

import Link from "next/link";
import { money } from "@/lib/format";
import { useDnse } from "./DnseProvider";

const quantity = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const percent = (value: number) => Math.abs(value).toFixed(2).replace(".", ",") + "%";
const signed = (value: number) => (value >= 0 ? "+" : "−") + money(Math.abs(value));

export function DnseSourceBadge() {
  const { source } = useDnse();
  if (source === "MOCK") return <span className="demo-badge">DỮ LIỆU MẪU</span>;
  if (source === "DNSE") return <span className="source-badge">DNSE · ENTRADE X</span>;
  return null;
}

export function DnseSummaryCards() {
  const { loading, error, netAssets, stockValue, costValue, cash, availableCash, debt, pnl, pnlPercent, positions } =
    useDnse();
  const pending = loading && !positions.length && !cash;
  const show = (value: string) => (pending ? "…" : value);

  return (
    <section className="summary-grid portfolio-summary dnse-summary">
      <article className="summary-card total-card">
        <div className="card-label">
          TÀI SẢN RÒNG · DNSE <DnseSourceBadge />
        </div>
        <div className="total-number">{show(money(netAssets))}</div>
        <div className="total-foot">
          <span className="muted">
            {error ? error : `Tiền + cổ phiếu theo giá mới nhất${debt ? ` − nợ ${money(debt)}` : ""}`}
          </span>
        </div>
      </article>
      <article className="summary-card">
        <div className="card-label">CỔ PHIẾU · THEO GIÁ HIỆN TẠI</div>
        <div className="metric-number">{show(money(stockValue))}</div>
        <div className="allocation-caption">
          <span>
            {positions.length} mã · giá vốn {money(costValue)}
          </span>
        </div>
      </article>
      <article className="summary-card">
        <div className="card-label">TIỀN MẶT</div>
        <div className="metric-number">{show(money(cash))}</div>
        <div className="cash-caption">
          <span className="cash-dot" /> Khả dụng {money(availableCash)}
        </div>
      </article>
      <article className="summary-card">
        <div className="card-label">LÃI/LỖ TẠM TÍNH</div>
        <div className={`metric-number ${pnl >= 0 ? "profit" : "loss-text"}`}>{show(signed(pnl))}</div>
        <div className="allocation-caption">
          <span className={pnl >= 0 ? "profit" : "loss-text"}>
            {pnl >= 0 ? "▲" : "▼"} {percent(pnlPercent)} so với giá vốn
          </span>
        </div>
      </article>
    </section>
  );
}

export function DnsePositionsTable() {
  const { positions, loading, error, refresh, fetchedAt } = useDnse();

  return (
    <section className="panel holdings-panel dnse-positions">
      <div className="holdings-heading">
        <div>
          <h2>
            Vị thế trên DNSE <DnseSourceBadge />
          </h2>
          <p>Giá vốn và khối lượng lấy trực tiếp từ tài khoản Entrade X; bấm vào mã để xem biểu đồ</p>
        </div>
        <button className="filter-button" onClick={refresh} disabled={loading}>
          {loading ? "Đang tải…" : "↻ Làm mới"}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>MÃ</th>
              <th className="align-right">KHỐI LƯỢNG</th>
              <th className="align-right">GIÁ VỐN TB</th>
              <th className="align-right">GIÁ HIỆN TẠI</th>
              <th className="align-right">GIÁ TRỊ</th>
              <th className="align-right">LÃI/LỖ</th>
              <th className="align-right">TỶ TRỌNG</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link className="stock-name stock-link" href={`/stock/${item.symbol}`}>
                    <span className={`stock-logo logo-${item.symbol.toLowerCase()}`}>{item.symbol.slice(0, 1)}</span>
                    <div>
                      <strong>{item.symbol}</strong>
                      <small>Tiểu khoản {item.accountNo.slice(-4).padStart(item.accountNo.length, "•")}</small>
                    </div>
                  </Link>
                </td>
                <td className="align-right">
                  {quantity(item.quantity)}
                  {item.availableQuantity !== item.quantity && (
                    <small className="cell-note">Khả dụng {quantity(item.availableQuantity)}</small>
                  )}
                </td>
                <td className="align-right">{money(item.costPrice)}</td>
                <td className="align-right">
                  {money(item.price)}
                  {!item.priceIsLive && <small className="cell-note">Giá DNSE báo</small>}
                </td>
                <td className="align-right value-cell">{money(item.marketValue)}</td>
                <td className="align-right">
                  <span className={`pnl-badge ${item.pnl >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                    <strong>{signed(item.pnl)}</strong>
                    <small>
                      {item.pnl >= 0 ? "▲" : "▼"} {percent(item.pnlPercent)}
                    </small>
                  </span>
                </td>
                <td className="align-right">
                  <span className="weight-cell">
                    {item.weight.toFixed(1).replace(".", ",")}%
                    <i style={{ width: `${Math.max(item.weight, 2)}%` }} />
                  </span>
                </td>
              </tr>
            ))}
            {!positions.length && (
              <tr>
                <td className="empty-state" colSpan={7}>
                  {loading
                    ? "Đang tải vị thế từ DNSE…"
                    : error
                      ? error
                      : "Tài khoản DNSE hiện chưa nắm giữ cổ phiếu nào."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          <strong>{positions.length}</strong> mã đang nắm giữ
        </span>
        {fetchedAt && (
          <span>
            Cập nhật{" "}
            {new Intl.DateTimeFormat("vi-VN", { timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(
              new Date(fetchedAt),
            )}
          </span>
        )}
      </div>
    </section>
  );
}
