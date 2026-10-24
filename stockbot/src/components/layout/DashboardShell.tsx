"use client";

import { usePathname } from "next/navigation";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { DnseProvider } from "@/components/dnse/DnseProvider";
import { PortfolioProvider } from "@/components/portfolio/PortfolioProvider";
import { WatchlistProvider } from "@/components/watchlist/WatchlistProvider";
import { titleForPath } from "@/lib/sections";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <PortfolioProvider>
      <DnseProvider>
        <WatchlistProvider>
          <main className="app-shell">
            <Sidebar />
            <section className="main-area">
              <Topbar title={titleForPath(pathname)} />
              <div className="content">
                {children}
                <footer className="page-footer">
                  <span>© 2026 Stockmate</span>
                  <span>
                    Giá được tải từ nguồn thị trường khi mở danh mục <i /> VND
                    và USD tách riêng
                  </span>
                </footer>
              </div>
            </section>
            <ChatAssistant />
          </main>
        </WatchlistProvider>
      </DnseProvider>
    </PortfolioProvider>
  );
}
