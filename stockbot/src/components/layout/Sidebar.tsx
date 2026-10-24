"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionHrefs, sectionLabels } from "@/lib/sections";
import type { AppSection } from "@/lib/types";
import { SymbolSearch } from "./SymbolSearch";

const sectionIcons: Record<AppSection, string> = {
  overview: "▦",
  portfolio: "◫",
  markets: "⌁",
  performance: "↗",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link className="brand" href="/">
        <span className="brand-mark">S</span>
        <span>
          stock<span className="brand-light">mate</span>
          <small>ĐẦU TƯ CÓ KẾ HOẠCH</small>
        </span>
      </Link>
      <SymbolSearch />
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
