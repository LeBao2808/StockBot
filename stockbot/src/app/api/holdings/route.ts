import { NextResponse } from "next/server";
import { getMainPortfolio, isMarket } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const portfolio = await getMainPortfolio();
    const market = new URL(request.url).searchParams.get("market");
    if (market && market !== "Tất cả" && !isMarket(market)) {
      return NextResponse.json({ error: "Sàn giao dịch không hợp lệ." }, { status: 400 });
    }
    const holdings = await prisma.holding.findMany({
      where: { portfolioId: portfolio.id, ...(market && market !== "Tất cả" ? { exchange: market } : {}) },
      orderBy: [{ exchange: "asc" }, { ticker: "asc" }],
    });
    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ error: "Không tải được danh mục cổ phiếu." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : ticker;
  const exchange = body.exchange;
  const quantity = Number(body.quantity);
  const averagePrice = Number(body.averagePrice);

  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
    return NextResponse.json({ error: "Mã cổ phiếu không hợp lệ." }, { status: 400 });
  }
  if (!isMarket(exchange)) return NextResponse.json({ error: "Sàn giao dịch không hợp lệ." }, { status: 400 });
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return NextResponse.json({ error: "Khối lượng phải là số nguyên dương." }, { status: 400 });
  if (!Number.isFinite(averagePrice) || averagePrice <= 0) return NextResponse.json({ error: "Giá vốn trung bình phải lớn hơn 0." }, { status: 400 });

  try {
    const portfolio = await getMainPortfolio();
    const holding = await prisma.holding.create({
      data: { ticker, name, exchange, quantity, averagePrice, currency: exchange === "US" ? "USD" : "VND", portfolioId: portfolio.id },
    });
    return NextResponse.json({ holding }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: `${ticker} đã có trong danh mục trên sàn ${exchange}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Không thêm được cổ phiếu. Hãy kiểm tra kết nối database." }, { status: 503 });
  }
}
