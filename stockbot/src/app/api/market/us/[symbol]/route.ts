import { NextResponse } from "next/server";
import { getFinnhubQuote } from "@/lib/finnhub";

export const runtime = "nodejs";

type Context = { params: Promise<{ symbol: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: "Mã cổ phiếu không hợp lệ." }, { status: 400 });
  }

  try {
    const quote = await getFinnhubQuote(symbol);
    if (!quote) return NextResponse.json({ error: `Finnhub chưa có báo giá cho mã ${symbol}.` }, { status: 404 });
    return NextResponse.json({ quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu từ Finnhub.";
    const status = message.startsWith("Thiếu FINNHUB_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
