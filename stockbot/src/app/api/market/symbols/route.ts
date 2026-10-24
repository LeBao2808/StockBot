import { NextResponse } from "next/server";
import { getDnseInstruments } from "@/lib/dnse-market";

export const runtime = "nodejs";

export async function GET() {
  try {
    const symbols = await getDnseInstruments();
    return NextResponse.json({ symbols }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được danh sách mã từ DNSE.";
    const status = message.startsWith("Thiếu DNSE_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
