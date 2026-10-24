import { NextResponse } from "next/server";
import { callStockMateTool, type HoldingComparison, type StockMateToolName, type StockMateToolOutput } from "@/lib/stockmate-mcp";

export const runtime = "nodejs";

const instructions = `You are StockMate, a friendly Vietnamese stock portfolio assistant. Speak naturally, clearly, and warmly, with light empathy; avoid sounding theatrical or overly sentimental. Answer in Vietnamese unless the user writes in another language. For current market prices, portfolio positions, cost basis, profit/loss, or DNSE cash balance, use the relevant tool instead of guessing. Never invent prices, balances, or holdings. When reporting DNSE balances, keep the returned balance categories separate, mask account numbers, and do not present buying power or margin as cash available. Market data and portfolio calculations are informational, not a recommendation to buy or sell. Do not claim to have executed an action unless a tool did it.`;

const tools = [
  {
    name: "compare_portfolio_holding",
    description: "Compare a saved position with its current quote. Use when the user asks about their cost basis, position value, or profit/loss for a ticker. The MCP tool selects DNSE for Vietnamese VND holdings and Finnhub for US USD holdings.",
    parameters: {
      type: "OBJECT",
      properties: { symbol: { type: "STRING", description: "Ticker symbol such as AAPL" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_stock_quote",
    description: "Get a stock's latest price when the user asks for a quote without asking about their portfolio. Choose market=VN for Vietnamese tickers on HOSE/HNX/UPCoM (e.g. FPT, VNM, HPG); choose market=US for US tickers (e.g. AAPL, MSFT). Vietnamese quotes use DNSE; US quotes use Finnhub.",
    parameters: {
      type: "OBJECT",
      properties: {
        symbol: { type: "STRING", description: "Ticker symbol such as FPT or AAPL" },
        market: { type: "STRING", enum: ["VN", "US"], description: "VN for Vietnamese exchanges; US for US exchanges" },
      },
      required: ["symbol", "market"],
    },
  },
  {
    name: "summarize_portfolio",
    description: "Read and summarize the user's saved portfolio. Use when they ask for an overview or summary of their holdings. Vietnamese holdings use DNSE; US holdings use Finnhub.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_dnse_cash_balance",
    description: "Read the user's actual DNSE sub-account balance using DNSE OpenAPI. Use when they ask how much cash/money remains in their brokerage wallet or for account cash balance. This is read-only. Keep DNSE balance categories separate and do not equate buying power with cash.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_dnse_positions",
    description: "Read the stock positions the user actually holds in their DNSE (Entrade X) account: symbols, quantity, average cost, current price, profit/loss and net assets. Use when they ask what they hold on DNSE/Entrade X, their real cost basis there, or real P/L. Read-only.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
];

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

async function generateGemini(contents: GeminiContent[], apiKey: string, model: string): Promise<GeminiContent> {
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

    let content = await generateGemini(contents, apiKey, model);
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
        let toolResult: StockMateToolOutput;
        try {
          toolResult = await callStockMateTool(call.name as StockMateToolName, (call.args || {}) as Record<string, string>);
        } catch (error) {
          toolResult = {
            answer: error instanceof Error ? error.message : "StockMate chưa lấy được dữ liệu cho câu hỏi này.",
            source: "MCP + DNSE",
          };
        }
        // Keep personal brokerage balances and positions inside StockMate; don't send the MCP result back to Gemini for paraphrasing.
        if (call.name === "get_dnse_cash_balance" || call.name === "get_dnse_positions") {
          return NextResponse.json({ answer: toolResult.answer, source: "MCP + DNSE", fetchedAt: toolResult.fetchedAt });
        }
        if (toolResult.comparison) comparison = toolResult.comparison;
        if (toolResult.fetchedAt) fetchedAt = toolResult.fetchedAt;
        source = toolResult.source === "MCP + DNSE" ? "Gemini + MCP + DNSE" : "Gemini + MCP + Finnhub";
        functionResponses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: toolResult as unknown as Record<string, unknown> } } as GeminiPart);
      }

      contents.push({ role: "user", parts: functionResponses });
      content = await generateGemini(contents, apiKey, model);
    }

    const answer = content.parts.map((part) => part.text || "").join("\n").trim() || "Mình chưa tạo được câu trả lời. Bạn thử hỏi lại theo cách khác nhé.";
    return NextResponse.json({ answer, source, fetchedAt, ...(comparison ? { comparison } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trợ lý AI chưa phản hồi được.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
