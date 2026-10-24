import { NextResponse } from "next/server";
import { getBoard } from "@/lib/dnse-board";

export const runtime = "nodejs";

type Context = { params: Promise<{ symbol: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });
  }
  try {
    const board = await getBoard(symbol);
    if (board.price === null) return NextResponse.json({ error: `DNSE chưa có dữ liệu bảng giá cho mã ${symbol}.` }, { status: 404 });
    return NextResponse.json({ board }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được bảng giá từ DNSE.";
    const status = message.startsWith("Thiếu DNSE_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
