import { dollars, money } from "@/lib/format";
import type { PortfolioComparison } from "@/lib/types";

export function ComparisonTable({
  comparison,
}: {
  comparison: PortfolioComparison;
}) {
  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Số lượng</th>
            <th>Giá vốn / cổ ({comparison.currency})</th>
            <th>Giá hiện tại (USD)</th>
            <th>Vốn mua</th>
            <th>Giá trị hiện tại</th>
            <th>Lãi / lỗ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{comparison.ticker}</td>
            <td>{new Intl.NumberFormat("en-US").format(comparison.quantity)}</td>
            <td>
              {comparison.currency === "USD"
                ? dollars(comparison.averagePrice)
                : money(comparison.averagePrice)}
            </td>
            <td>{dollars(comparison.currentPrice)}</td>
            {comparison.currencyMismatch ? (
              <td colSpan={3}>Không thể so sánh: đơn vị tiền tệ không khớp</td>
            ) : (
              <>
                <td>{dollars(comparison.costBasis ?? 0)}</td>
                <td>{dollars(comparison.marketValue ?? 0)}</td>
                <td
                  className={
                    (comparison.unrealizedPnl ?? 0) >= 0 ? "profit" : "loss"
                  }
                >
                  {(comparison.unrealizedPnl ?? 0) >= 0 ? "+" : "−"}
                  {dollars(Math.abs(comparison.unrealizedPnl ?? 0))}
                  <small>
                    {" "}
                    ({(comparison.pnlPercent ?? 0) >= 0 ? "+" : ""}
                    {(comparison.pnlPercent ?? 0).toFixed(2)}%)
                  </small>
                </td>
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
