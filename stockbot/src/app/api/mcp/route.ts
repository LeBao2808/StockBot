import { createHash, timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import { createStockMateMcpServer } from "@/lib/stockmate-mcp";

export const runtime = "nodejs";

const mcpHandler = createMcpHandler(() => createStockMateMcpServer());

async function handleMcpRequest(request: Request) {
  const configuredToken = process.env.STOCKMATE_MCP_TOKEN;
  if (!configuredToken) {
    return NextResponse.json({ error: "MCP endpoint chưa được bật. Hãy cấu hình STOCKMATE_MCP_TOKEN trong .env." }, { status: 503 });
  }

  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const configuredDigest = createHash("sha256").update(configuredToken).digest();
  const suppliedDigest = createHash("sha256").update(suppliedToken).digest();
  if (!timingSafeEqual(configuredDigest, suppliedDigest)) {
    return NextResponse.json({ error: "MCP token không hợp lệ." }, { status: 401 });
  }

  return mcpHandler.fetch(request);
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
