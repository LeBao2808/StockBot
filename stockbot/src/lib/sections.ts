import type { AppSection } from "./types";

export const sectionLabels: Record<AppSection, string> = {
  overview: "Tổng quan",
  portfolio: "Danh mục",
  markets: "Thị trường",
  performance: "Hiệu suất",
};

export const sectionHrefs: Record<AppSection, string> = {
  overview: "/",
  portfolio: "/portfolio",
  markets: "/markets",
  performance: "/performance",
};

/** Breadcrumb title for the current pathname. */
export function titleForPath(pathname: string) {
  const stock = pathname.match(/^\/stock\/([^/]+)/);
  if (stock) return `Cổ phiếu ${decodeURIComponent(stock[1]).toUpperCase()}`;
  const section = (Object.keys(sectionHrefs) as AppSection[]).find(
    (key) => sectionHrefs[key] === pathname,
  );
  return sectionLabels[section ?? "overview"];
}
