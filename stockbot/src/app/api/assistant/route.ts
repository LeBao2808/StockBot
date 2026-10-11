import { NextResponse } from "next/server";
import { getMainPortfolio } from "@/lib/portfolio";
import { getFinnhubQuote } from "@/lib/finnhub";
import { prisma } from "@/lib/prisma";
import { callStockMateComparisonTool } from "@/lib/stockmate-mcp";

export const runtime = "nodejs";

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const comparisonIntent = (question: string) => /danh\s*muc|lai|loi|lo|gia\s*tri|gia\s*von|da\s*mua|luc\s*mua/i.test(question.normalize("NFD").replace(/\p{Diacritic}/gu, ""));

export async function POST(request: Request) {
  let question: string;
  try {
    const body = await request.json();
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ error: "Câu hỏi không hợp lệ." }, { status: 400 });
  }
  if (!question || question.length > 500) return NextResponse.json({ error: "Câu hỏi cần có từ 1 đến 500 ký tự." }, { status: 400 });

  try {
    const portfolio = await getMainPortfolio();
    const holdings = await prisma.holding.findMany({ where: { portfolioId: portfolio.id }, orderBy: { ticker: "asc" } });
    const knownSymbols = new Set(holdings.map((holding) => holding.ticker.toUpperCase()));
    const requestedSymbols = [...question.matchAll(/\b[A-Z][A-Z0-9.-]{1,11}\b/g)].map((match) => match[0]);
    const symbol = requestedSymbols.find((candidate) => knownSymbols.has(candidate)) ?? requestedSymbols[0];

    if (symbol) {
      if (comparisonIntent(question)) {
        const toolResult = await callStockMateComparisonTool(symbol);
        return NextResponse.json(toolResult);
      }

      const quote = await getFinnhubQuote(symbol);
      if (!quote) {
        return NextResponse.json({ answer: `Finnhub hiện chưa có báo giá cho mã ${symbol}. StockMate hiện tra cứu giá bằng Finnhub.`, source: "Finnhub", quotes: [] });
      }

      const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
      const movement = `${quote.symbol} đang ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% so với giá đóng cửa trước. Giá gần nhất: ${new Intl.NumberFormat("en-US", { style: "currency", currency: quote.currency }).format(quote.price)}.`;
      const time = quote.timestamp
        ? ` Dữ liệu lúc ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(quote.timestamp))} giờ New York.`
        : "";

      return NextResponse.json({ answer: `${movement}${time} Nguồn: Finnhub.`, source: quote.source, fetchedAt: quote.timestamp, quotes: [quote] });
    }

    if (!holdings.length) {
      return NextResponse.json({ answer: "Danh mục hiện chưa có mã nào. Hãy thêm mã cổ phiếu Mỹ hoặc hỏi trực tiếp một mã như AAPL để tra cứu Finnhub.", source: "Finnhub", quotes: [] });
    }

    const results = await Promise.all(holdings.map(async (holding) => {
      try {
        const quote = await getFinnhubQuote(holding.ticker);
        return quote ? { holding, quote } : null;
      } catch {
        return null;
      }
    }));
    const available = results.filter((item): item is NonNullable<typeof item> => item !== null);
    const lines = available.map(({ holding, quote }) => {
      if (holding.exchange !== "US" || holding.currency !== "USD") return `${quote.symbol}: ${usd(quote.price)} (Finnhub)`;
      const current = holding.quantity * quote.price;
      const pnl = current - holding.quantity * holding.averagePrice;
      return `${quote.symbol}: giá trị ${usd(current)}, lãi/lỗ tạm tính ${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))}`;
    }).join(" · ");
    const answer = available.length
      ? `Giá trị danh mục theo dữ liệu Finnhub: ${lines}. Các mã không được Finnhub hỗ trợ có thể không xuất hiện.`
      : "Finnhub chưa trả được giá cho các mã trong danh mục. Hãy kiểm tra mã cổ phiếu hoặc API key Finnhub.";
    return NextResponse.json({ answer, source: "Finnhub", fetchedAt: new Date().toISOString(), quotes: available.map(({ quote }) => quote) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu thị trường từ Finnhub.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
