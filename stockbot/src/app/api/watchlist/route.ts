import { NextResponse } from "next/server";
import { getMainPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const dbError = (message: string) =>
  NextResponse.json({ error: `${message} Hãy kiểm tra kết nối database (và đã chạy npm run db:push).` }, { status: 503 });

function readSymbol(value: unknown) {
  const symbol = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{2,12}$/.test(symbol) ? symbol : null;
}

export async function GET() {
  try {
    const portfolio = await getMainPortfolio();
    const items = await prisma.watchlistItem.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ items });
  } catch {
    return dbError("Không tải được danh sách theo dõi.");
  }
}

export async function POST(request: Request) {
  let symbol: string | null;
  try {
    symbol = readSymbol((await request.json()).symbol);
  } catch {
    symbol = null;
  }
  if (!symbol) return NextResponse.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });

  try {
    const portfolio = await getMainPortfolio();
    const item = await prisma.watchlistItem.upsert({
      where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol } },
      create: { portfolioId: portfolio.id, symbol },
      update: {},
    });
    return NextResponse.json({ item });
  } catch {
    return dbError("Không thêm được mã vào danh sách theo dõi.");
  }
}

export async function DELETE(request: Request) {
  const symbol = readSymbol(new URL(request.url).searchParams.get("symbol"));
  if (!symbol) return NextResponse.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });

  try {
    const portfolio = await getMainPortfolio();
    await prisma.watchlistItem.deleteMany({ where: { portfolioId: portfolio.id, symbol } });
    return NextResponse.json({ ok: true });
  } catch {
    return dbError("Không xóa được mã khỏi danh sách theo dõi.");
  }
}
