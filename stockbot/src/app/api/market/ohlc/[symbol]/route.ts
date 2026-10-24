import { NextResponse } from "next/server";
import { getDnseOhlc, OHLC_RESOLUTIONS, type OhlcMarketType, type OhlcResolution } from "@/lib/dnse-market";

export const runtime = "nodejs";

type Context = { params: Promise<{ symbol: string }> };

const DAY = 86_400;
// Default look-back per resolution, sized to a few hundred candles.
const defaultRange: Record<OhlcResolution, number> = {
  "1": 3 * DAY,
  "3": 7 * DAY,
  "5": 14 * DAY,
  "15": 30 * DAY,
  "30": 60 * DAY,
  "1H": 120 * DAY,
  "1D": 365 * DAY,
  "1W": 5 * 365 * DAY,
};
const marketTypes: OhlcMarketType[] = ["STOCK", "DERIVATIVE", "INDEX"];

export async function GET(request: Request, { params }: Context) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });
  }

  const search = new URL(request.url).searchParams;
  const resolution = (search.get("resolution") ?? "1D") as OhlcResolution;
  if (!OHLC_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json({ error: `Khung thời gian phải là một trong: ${OHLC_RESOLUTIONS.join(", ")}.` }, { status: 400 });
  }
  const type = (search.get("type") ?? "STOCK").toUpperCase() as OhlcMarketType;
  if (!marketTypes.includes(type)) {
    return NextResponse.json({ error: "Loại thị trường phải là STOCK, DERIVATIVE hoặc INDEX." }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  const to = Number(search.get("to") ?? now);
  const from = Number(search.get("from") ?? to - defaultRange[resolution]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || from >= to) {
    return NextResponse.json({ error: "Khoảng thời gian from/to (Unix giây) không hợp lệ." }, { status: 400 });
  }

  try {
    const candles = await getDnseOhlc(symbol, resolution, from, to, type);
    const intraday = resolution !== "1D" && resolution !== "1W";
    return NextResponse.json(
      { symbol, type, resolution, from, to, currency: type === "STOCK" ? "VND" : "POINT", candles, source: "DNSE" },
      { headers: { "Cache-Control": `private, max-age=${intraday ? 15 : 300}` } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được dữ liệu nến từ DNSE.";
    const status = message.startsWith("Thiếu DNSE_") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
