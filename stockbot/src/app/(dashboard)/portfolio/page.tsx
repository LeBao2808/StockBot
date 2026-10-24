"use client";

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
        description="Quản lý vốn và các mã cổ phiếu bạn đang nắm giữ."
        action={
          <button
            className="primary-button"
            onClick={() => form.setShowAdd(true)}
          >
            <span>＋</span> Thêm cổ phiếu
          </button>
        }
      />
      <PortfolioSummary />
      <HoldingsTable form={form} />
      <HoldingModal form={form} />
    </>
  );
}
