import { DnsePositionsTable, DnseSummaryCards } from "@/components/dnse/DnsePortfolio";
import { PageHeader } from "@/components/layout/PageHeader";
import { HotStocks } from "@/components/markets/HotStocks";
import { OverviewSummary } from "@/components/portfolio/OverviewSummary";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title={
          <>
            Chào buổi sáng, Bảo <span>✳</span>
          </>
        }
        description="Đây là bức tranh tổng quan về khoản đầu tư của bạn."
      />
      <HotStocks />
      <div className="section-title">
        <h2>Tài khoản DNSE của bạn</h2>
        <p>Entrade X · chỉ đọc</p>
      </div>
      <DnseSummaryCards />
      <DnsePositionsTable />
      <div className="section-title">
        <h2>Danh mục nhập tay</h2>
        <p>Cổ phiếu Mỹ và các khoản ngoài DNSE</p>
      </div>
      <OverviewSummary />
    </>
  );
}
