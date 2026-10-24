"use client";

import { useState } from "react";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { UsStockLookup } from "@/components/markets/UsStockLookup";
import { HoldingModal, useHoldingForm } from "@/components/portfolio/HoldingModal";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { OverviewSummary } from "@/components/portfolio/OverviewSummary";
import { PerformanceSection } from "@/components/portfolio/PerformanceSection";
import {
  PortfolioProvider,
  usePortfolio,
} from "@/components/portfolio/PortfolioProvider";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import { sectionLabels } from "@/lib/sections";
import type { AppSection } from "@/lib/types";

const sectionDescriptions: Record<AppSection, string> = {
  overview: "Đây là bức tranh tổng quan về khoản đầu tư của bạn.",
  portfolio: "Quản lý vốn và các mã cổ phiếu bạn đang nắm giữ.",
  markets: "Tra cứu giá cổ phiếu quốc tế bằng Finnhub.",
  performance: "Theo dõi lãi/lỗ và hiệu suất danh mục theo thời gian.",
};

function Dashboard() {
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const { apiError } = usePortfolio();
  const form = useHoldingForm();

  return (
    <main className="app-shell">
      <Sidebar activeSection={activeSection} onNavigate={setActiveSection} />

      <section className="main-area" id="portfolio">
        <Topbar title={sectionLabels[activeSection]} />
        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="sparkle">✳</span> KHÔNG GIAN ĐẦU TƯ
              </div>
              <h1>
                {activeSection === "overview" ? (
                  <>
                    Chào buổi sáng, Bảo <span>✳</span>
                  </>
                ) : (
                  sectionLabels[activeSection]
                )}
              </h1>
              <p>{sectionDescriptions[activeSection]}</p>
            </div>
            {activeSection === "portfolio" && (
              <button
                className="primary-button"
                onClick={() => form.setShowAdd(true)}
              >
                <span>＋</span> Thêm cổ phiếu
              </button>
            )}
          </section>
          {apiError && (
            <div className="api-alert" role="alert">
              <span>!</span>
              {apiError}
            </div>
          )}

          {activeSection === "performance" && <PerformanceSection />}
          {activeSection === "overview" && <OverviewSummary />}
          {activeSection === "portfolio" && (
            <>
              <PortfolioSummary />
              <HoldingsTable form={form} />
            </>
          )}
          {activeSection === "markets" && <UsStockLookup />}

          <footer className="page-footer">
            <span>© 2026 Stockmate</span>
            <span>
              Giá được tải từ nguồn thị trường khi mở danh mục <i /> VND và USD
              tách riêng
            </span>
          </footer>
        </div>
      </section>
      <HoldingModal form={form} />
      <ChatAssistant />
    </main>
  );
}

export default function Home() {
  return (
    <PortfolioProvider>
      <Dashboard />
    </PortfolioProvider>
  );
}
