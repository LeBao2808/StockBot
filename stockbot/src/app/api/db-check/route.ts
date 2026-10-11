import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return NextResponse.json({ connected: true, database: "stockbot" });
  } catch {
    return NextResponse.json({ connected: false, error: "Không kết nối được MongoDB." }, { status: 503 });
  }
}
