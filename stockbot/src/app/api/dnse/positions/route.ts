import { NextResponse } from "next/server";
import { getDnsePositions } from "@/lib/dnse-account";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { source, positions } = await getDnsePositions();
    return NextResponse.json({ source, positions, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được vị thế từ DNSE.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
