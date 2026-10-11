import { prisma } from "@/lib/prisma";

export async function getMainPortfolio() {
  const existing = await prisma.portfolio.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  return prisma.portfolio.create({
    data: { name: "Danh mục chính", capital: 0, currency: "VND" },
  });
}

export function isMarket(value: unknown): value is "HOSE" | "HNX" | "UPCOM" {
  return value === "HOSE" || value === "HNX" || value === "UPCOM";
}
