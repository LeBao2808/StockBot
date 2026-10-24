"use client";

import { sectionLabels } from "@/lib/sections";
import type { AppSection } from "@/lib/types";

const sectionIcons: Record<AppSection, string> = {
  overview: "▦",
  portfolio: "◫",
  markets: "⌁",
  performance: "↗",
};

export function Sidebar({
  activeSection,
  onNavigate,
}: {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
}) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#">
        <span className="brand-mark">S</span>
        <span>
          stock<span className="brand-light">mate</span>
          <small>ĐẦU TƯ CÓ KẾ HOẠCH</small>
        </span>
      </a>
      <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
      <nav className="nav-list" aria-label="Điều hướng chính">
        {(Object.keys(sectionLabels) as AppSection[]).map((section) => (
          <button
            key={section}
            type="button"
            className={`nav-item ${activeSection === section ? "active" : ""}`}
            onClick={() => onNavigate(section)}
          >
            <span>{sectionIcons[section]}</span> {sectionLabels[section]}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon">✳</span>
          <strong>Bắt đầu thật vững</strong>
          <p>Ghi lại vốn và danh mục để theo dõi tài sản của bạn.</p>
          <button type="button" onClick={() => onNavigate("portfolio")}>
            Thiết lập danh mục <span>↗</span>
          </button>
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
