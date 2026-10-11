import { NextResponse } from "next/server";
import { getMainPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const portfolio = await getMainPortfolio();
    const holdings = await prisma.holding.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: [{ exchange: "asc" }, { ticker: "asc" }],
    });
    return NextResponse.json({ portfolio, holdings });
  } catch {
    return NextResponse.json({ error: "Không tải được danh mục. Hãy kiểm tra kết nối database." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let body: { capital?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const capital = Number(body.capital);
  if (!Number.isFinite(capital) || capital < 0) {
    return NextResponse.json({ error: "Vốn phải là số không âm." }, { status: 400 });
  }

  try {
    const portfolio = await getMainPortfolio();
    const updated = await prisma.portfolio.update({ where: { id: portfolio.id }, data: { capital } });
    return NextResponse.json({ portfolio: updated });
  } catch {
    return NextResponse.json({ error: "Không lưu được vốn đầu tư." }, { status: 503 });
  }
}
