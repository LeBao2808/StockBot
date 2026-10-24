"use client";

import { useMarketOpen } from "@/lib/market-hours";

export function Topbar({ title }: { title: string }) {
  const marketOpen = useMarketOpen();
  return (
    <header className="topbar">
      <div className="breadcrumb">
        Không gian đầu tư <span>/</span> <strong>{title}</strong>
      </div>
      <div className="top-actions">
        <span className={`market-status ${marketOpen === false ? "closed" : ""}`}>
          <i />{" "}
          {marketOpen === null
            ? "Đang kiểm tra phiên…"
            : marketOpen
              ? "Thị trường đang mở · giá tự cập nhật"
              : "Ngoài giờ giao dịch"}
        </span>
        <button className="icon-button" aria-label="Thông báo">
          ♧<b />
        </button>
        <div className="top-avatar">B</div>
      </div>
    </header>
  );
}
