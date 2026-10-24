import { NextResponse } from "next/server";
import { getDnseValuation } from "@/lib/dnse-account";
import { getMainPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const portfolio = await getMainPortfolio();
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { capturedAt: "asc" },
      take: 1000,
    });
    return NextResponse.json({ snapshots });
  } catch {
    return NextResponse.json({ error: "Không tải được lịch sử tài sản. Hãy kiểm tra kết nối database." }, { status: 503 });
  }
}

/** Values the DNSE account now and stores it as a snapshot. */
export async function POST() {
  let valuation;
  try {
    valuation = await getDnseValuation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu từ DNSE.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const portfolio = await getMainPortfolio();
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        portfolioId: portfolio.id,
        totalValueVnd: valuation.netAssets,
        unrealizedPnlVnd: valuation.pnl,
        priceSource: valuation.source,
        note: `${valuation.positions.length} mã · tiền ${Math.round(valuation.cash)} · CP ${Math.round(valuation.stockValue)} · nợ ${Math.round(valuation.debt)}`,
      },
    });
    return NextResponse.json({ snapshot, valuation });
  } catch {
    return NextResponse.json({ error: "Không lưu được snapshot. Hãy kiểm tra kết nối database." }, { status: 503 });
  }
}
