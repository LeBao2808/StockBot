import { NextResponse } from "next/server";
import { getHotStocks } from "@/lib/dnse-board";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { session, stocks } = await getHotStocks();
    return NextResponse.json({ session, stocks }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được dữ liệu thị trường từ DNSE.";
    const status = message.startsWith("Thiếu DNSE_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
