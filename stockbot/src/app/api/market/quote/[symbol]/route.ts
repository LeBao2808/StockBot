import { NextResponse } from "next/server";
import { getSsiQuote } from "@/lib/ssi-market";

export const runtime = "nodejs";

type Context = { params: Promise<{ symbol: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });
  }

  try {
    const quote = await getSsiQuote(symbol);
    if (!quote) return NextResponse.json({ error: `SSI chưa trả dữ liệu cho mã ${symbol}.` }, { status: 404 });
    return NextResponse.json({ quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu từ SSI.";
    const status = message.startsWith("Thiếu SSI_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
