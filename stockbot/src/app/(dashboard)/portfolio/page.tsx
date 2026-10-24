"use client";

import { DnsePositionsTable, DnseSummaryCards } from "@/components/dnse/DnsePortfolio";
import { PageHeader } from "@/components/layout/PageHeader";
import { HoldingModal, useHoldingForm } from "@/components/portfolio/HoldingModal";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";

export default function PortfolioPage() {
  const form = useHoldingForm();
  return (
    <>
      <PageHeader
        title="Danh mục"
        description="Vị thế thật trên DNSE và các khoản bạn tự ghi lại."
        action={
          <button
            className="primary-button"
            onClick={() => form.setShowAdd(true)}
          >
            <span>＋</span> Thêm cổ phiếu
          </button>
        }
      />
      <DnseSummaryCards />
      <DnsePositionsTable />
      <div className="section-title">
        <h2>Danh mục nhập tay</h2>
        <p>Cổ phiếu Mỹ (Finnhub) và các khoản ngoài DNSE — nguồn: dữ liệu bạn tự nhập</p>
      </div>
      <PortfolioSummary />
      <HoldingsTable form={form} />
      <HoldingModal form={form} />
    </>
  );
}
