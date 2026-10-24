import { NextResponse } from "next/server";
import { getDnseCash } from "@/lib/dnse-account";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { source, accounts } = await getDnseCash();
    return NextResponse.json({ source, accounts, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lấy được số dư tiền từ DNSE.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
