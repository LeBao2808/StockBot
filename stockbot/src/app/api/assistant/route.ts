import { NextResponse } from "next/server";
import { getMainPortfolio } from "@/lib/portfolio";
import { getFinnhubQuote } from "@/lib/finnhub";
import { getSsiQuote } from "@/lib/ssi-market";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
      if (knownSymbols.has(symbol)) {
        const quote = await getSsiQuote(symbol);
        if (!quote) return NextResponse.json({ answer: `SSI hiện không có dữ liệu cho mã ${symbol}.`, source: "SSI FastConnect", quotes: [] });
        const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
        const answer = `${quote.name} (${quote.symbol}${quote.exchange ? ` · ${quote.exchange}` : ""}) đang ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% so với tham chiếu. Giá gần nhất SSI trả về: ${new Intl.NumberFormat("vi-VN").format(quote.price)} VND; khối lượng khớp: ${new Intl.NumberFormat("vi-VN").format(quote.volume)}. Ngày dữ liệu: ${quote.tradingDate}.`;
        return NextResponse.json({ answer, source: quote.source, fetchedAt: quote.fetchedAt, quotes: [quote] });
      }

      try {
        const quote = await getFinnhubQuote(symbol);
        if (quote) {
          const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
          const answer = `${quote.symbol} đang ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% so với giá đóng cửa trước. Giá gần nhất: ${new Intl.NumberFormat("en-US", { style: "currency", currency: quote.currency }).format(quote.price)}. Dữ liệu từ Finnhub${quote.timestamp ? `, thời điểm ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(quote.timestamp))} giờ New York` : ""}.`;
          return NextResponse.json({ answer, source: quote.source, fetchedAt: quote.timestamp, quotes: [quote] });
        }
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Thiếu FINNHUB_API_KEY")) throw error;
      }

      try {
        const quote = await getSsiQuote(symbol);
        if (quote) {
          const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
          const answer = `${quote.name} (${quote.symbol}${quote.exchange ? ` · ${quote.exchange}` : ""}) đang ${direction} ${quote.changePercent.toFixed(2)}% so với tham chiếu. Giá gần nhất: ${new Intl.NumberFormat("vi-VN").format(quote.price)} VND. Ngày dữ liệu: ${quote.tradingDate}.`;
          return NextResponse.json({ answer, source: quote.source, fetchedAt: quote.fetchedAt, quotes: [quote] });
        }
      } catch {
        // Return the provider-independent response below when neither provider recognizes the symbol.
      }
      return NextResponse.json({ answer: `Chưa tìm thấy báo giá cho mã ${symbol} trên Finnhub hoặc SSI.`, source: "Finnhub + SSI", quotes: [] });
    }

    if (!holdings.length) {
      return NextResponse.json({ answer: "Danh mục hiện chưa có mã nào. Hãy thêm cổ phiếu hoặc hỏi trực tiếp một mã như FPT để tra cứu thị trường.", source: "Danh mục Stockmate", quotes: [] });
    }

    const results = await Promise.all(holdings.map(async (holding) => {
      try { return await getSsiQuote(holding.ticker); }
      catch { return null; }
    }));
    const quotes = results.filter((quote): quote is NonNullable<typeof quote> => quote !== null);
    const lines = quotes.map((quote) => `${quote.symbol}: ${quote.price} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%)`).join(" · ");
    return NextResponse.json({ answer: quotes.length ? `Giá thị trường SSI trả về cho danh mục: ${lines}. Dữ liệu theo phiên ${quotes[0].tradingDate}; đây chưa phải tính toán lãi/lỗ theo giá vốn.` : "Chưa lấy được dữ liệu giá từ SSI cho các mã trong danh mục.", source: "SSI FastConnect", fetchedAt: new Date().toISOString(), quotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu thị trường.";
    const status = message.startsWith("Thiếu SSI_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
