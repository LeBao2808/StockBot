"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { sectionHrefs, sectionLabels } from "@/lib/sections";
import type { AppSection } from "@/lib/types";

const sectionIcons: Record<AppSection, string> = {
  overview: "▦",
  portfolio: "◫",
  markets: "⌁",
  performance: "↗",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [symbol, setSymbol] = useState("");

  function openSymbol(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(value)) return;
    setSymbol("");
    router.push(`/stock/${value}`);
  }

  return (
    <aside className="sidebar">
      <Link className="brand" href="/">
        <span className="brand-mark">S</span>
        <span>
          stock<span className="brand-light">mate</span>
          <small>ĐẦU TƯ CÓ KẾ HOẠCH</small>
        </span>
      </Link>
      <form className="symbol-search" onSubmit={openSymbol} role="search">
        <label className="sr-only" htmlFor="symbol-search">
          Tra mã cổ phiếu
        </label>
        <input
          id="symbol-search"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          placeholder="Tra mã, ví dụ FPT"
          maxLength={12}
          autoComplete="off"
        />
        <button type="submit" aria-label="Xem biểu đồ">
          →
        </button>
      </form>
      <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
      <nav className="nav-list" aria-label="Điều hướng chính">
        {(Object.keys(sectionLabels) as AppSection[]).map((section) => (
          <Link
            key={section}
            href={sectionHrefs[section]}
            className={`nav-item ${pathname === sectionHrefs[section] ? "active" : ""}`}
          >
            <span>{sectionIcons[section]}</span> {sectionLabels[section]}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon">✳</span>
          <strong>Bắt đầu thật vững</strong>
          <p>Ghi lại vốn và danh mục để theo dõi tài sản của bạn.</p>
          <Link href="/portfolio">
            Thiết lập danh mục <span>↗</span>
          </Link>
        </div>
        <div className="profile">
          <div className="avatar">B</div>
          <div>
            <strong>Bảo Lê</strong>
            <small>Tài khoản cá nhân</small>
          </div>
          <span className="profile-dots">···</span>
        </div>
      </div>
    </aside>
  );
}
