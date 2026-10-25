import { NextResponse } from "next/server";
import {
  openStockMateSession,
  PRIVATE_TOOLS,
  type HoldingComparison,
  type McpToolInfo,
  type StockMateToolOutput,
} from "@/lib/stockmate-mcp";
import type { TraceStep } from "@/lib/types";

export const runtime = "nodejs";

const instructions = `You are StockMate, a friendly Vietnamese stock portfolio assistant. Speak naturally, clearly, and warmly, with light empathy; avoid sounding theatrical or overly sentimental. Answer in Vietnamese unless the user writes in another language. For current market prices, portfolio positions, cost basis, profit/loss, or DNSE cash balance, use the relevant tool instead of guessing. Never invent prices, balances, or holdings. When reporting DNSE balances, keep the returned balance categories separate, mask account numbers, and do not present buying power or margin as cash available. Market data and portfolio calculations are informational, not a recommendation to buy or sell. Do not claim to have executed an action unless a tool did it.`;

type GeminiSchema = {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
};
type GeminiFunction = { name: string; description: string; parameters: GeminiSchema };

/** Converts an MCP tool's JSON Schema into the OpenAPI-style subset Gemini accepts. */
function toGeminiSchema(schema: Record<string, unknown>): GeminiSchema {
  const type = typeof schema.type === "string" ? schema.type.toUpperCase() : "STRING";
  const result: GeminiSchema = { type };
  if (typeof schema.description === "string") result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum.map(String);
  if (schema.properties && typeof schema.properties === "object") {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
    result.required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  }
  if (schema.items && typeof schema.items === "object") result.items = toGeminiSchema(schema.items as Record<string, unknown>);
  return result;
}

const toGeminiFunction = (tool: McpToolInfo): GeminiFunction => ({
  name: tool.name,
  description: tool.description,
  parameters: toGeminiSchema(tool.inputSchema),
});

const TRACE_RESULT_LIMIT = 1200;

function summarizeResult(result: StockMateToolOutput) {
  const text = JSON.stringify(result, null, 2);
  return text.length > TRACE_RESULT_LIMIT ? `${text.slice(0, TRACE_RESULT_LIMIT)}\n…` : text;
}

async function timed<T>(task: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await task();
  return [value, Math.round(performance.now() - started)];
}

type ChatTurn = { role: "user" | "assistant"; content: string };
type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiResponse = { candidates?: Array<{ content?: GeminiContent }> ; error?: { message?: string } };

function readHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((turn): ChatTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as Record<string, unknown>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") return [];
    return [{ role: candidate.role, content: candidate.content.slice(0, 1000) }];
  });
}

async function generateGemini(contents: GeminiContent[], tools: GeminiFunction[], apiKey: string, model: string): Promise<GeminiContent> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      tools: [{ functionDeclarations: tools }],
    }),
    cache: "no-store",
  });
  const data = await response.json() as GeminiResponse;
  if (!response.ok) throw new Error(data.error?.message || `Gemini API trả về lỗi HTTP ${response.status}.`);
  const content = data.candidates?.[0]?.content;
  if (!content) throw new Error("Gemini không trả về nội dung. Hãy kiểm tra hạn mức hoặc quyền truy cập model.");
  return content;
}

export async function POST(request: Request) {
  let question: string;
  let history: ChatTurn[];
  try {
    const body = await request.json();
    question = typeof body.question === "string" ? body.question.trim() : "";
    history = readHistory(body.history);
  } catch {
    return NextResponse.json({ error: "Câu hỏi không hợp lệ." }, { status: 400 });
  }
  if (!question || question.length > 500) return NextResponse.json({ error: "Câu hỏi cần có từ 1 đến 500 ký tự." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Thiếu GEMINI_API_KEY trong .env. Hãy thêm API key để bật trợ lý AI." }, { status: 503 });

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const contents: GeminiContent[] = [
      ...history.map((turn) => ({ role: turn.role === "assistant" ? "model" as const : "user" as const, parts: [{ text: turn.content }] })),
      { role: "user", parts: [{ text: question }] },
    ];

    const trace: TraceStep[] = [];
    const mcp = await openStockMateSession();
    try {
      // Discover tools from the MCP server instead of a hand-written list.
      const [mcpTools, listMs] = await timed(() => mcp.listTools());
      trace.push({ kind: "list", ms: listMs, tools: mcpTools.map((tool) => tool.name) });
      const tools = mcpTools.map(toGeminiFunction);

      const ask = async () => {
        const [reply, ms] = await timed(() => generateGemini(contents, tools, apiKey, model));
        const calls = reply.parts.flatMap((part) => (part.functionCall?.name ? [part.functionCall.name] : []));
        trace.push({ kind: "llm", ms, decision: calls.length ? calls : ["trả lời"] });
        return reply;
      };

      let content = await ask();
      let comparison: HoldingComparison | undefined;
      let fetchedAt: string | null | undefined;
      let source = "Gemini";

      for (let round = 0; round < 3; round += 1) {
        const calls = content.parts.filter((part) => part.functionCall?.name);
        if (!calls.length) break;
        contents.push(content);
        const functionResponses: GeminiPart[] = [];

        for (const part of calls) {
          const call = part.functionCall!;
          const args = call.args || {};
          const isPrivate = PRIVATE_TOOLS.has(call.name);
          let toolResult: StockMateToolOutput;
          let ok = true;
          const started = performance.now();
          try {
            toolResult = await mcp.callTool(call.name, args);
          } catch (error) {
            ok = false;
            toolResult = {
              answer: error instanceof Error ? error.message : "StockMate chưa lấy được dữ liệu cho câu hỏi này.",
              source: "MCP + DNSE",
            };
          }
          trace.push({
            kind: "call",
            ms: Math.round(performance.now() - started),
            name: call.name,
            args,
            ok,
            ...(isPrivate ? { redacted: true } : { result: summarizeResult(toolResult) }),
          });
          // Keep personal brokerage balances and positions inside StockMate; don't send the MCP result back to Gemini for paraphrasing.
          if (isPrivate) {
            return NextResponse.json({ answer: toolResult.answer, source: "MCP + DNSE", fetchedAt: toolResult.fetchedAt, trace });
          }
          if (toolResult.comparison) comparison = toolResult.comparison;
          if (toolResult.fetchedAt) fetchedAt = toolResult.fetchedAt;
          source = toolResult.source === "MCP + DNSE" ? "Gemini + MCP + DNSE" : "Gemini + MCP + Finnhub";
          functionResponses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: toolResult as unknown as Record<string, unknown> } } as GeminiPart);
        }

        contents.push({ role: "user", parts: functionResponses });
        content = await ask();
      }

      const answer = content.parts.map((part) => part.text || "").join("\n").trim() || "Mình chưa tạo được câu trả lời. Bạn thử hỏi lại theo cách khác nhé.";
      return NextResponse.json({ answer, source, fetchedAt, trace, ...(comparison ? { comparison } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Trợ lý AI chưa phản hồi được.";
      return NextResponse.json({ error: message, trace }, { status: 502 });
    } finally {
      await mcp.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trợ lý AI chưa phản hồi được.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
