import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { getFinnhubQuote } from "@/lib/finnhub";
import { getDnseValuation } from "@/lib/dnse-account";
import { getDnseAccountBalances, getDnseQuote } from "@/lib/dnse-market";
import { getMainPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export type HoldingComparison = {
  ticker: string;
  quantity: number;
  currency: string;
  averagePrice: number;
  currentPrice: number;
  costBasis?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  pnlPercent?: number;
  currencyMismatch: boolean;
};

export type ComparisonToolResult = {
  answer: string;
  comparison?: HoldingComparison;
  fetchedAt?: string | null;
  source: "MCP + Finnhub" | "MCP + DNSE";
};

export type StockMateToolName = "compare_portfolio_holding" | "get_stock_quote" | "summarize_portfolio" | "get_dnse_cash_balance" | "get_dnse_positions";
export type StockMateToolOutput = ComparisonToolResult & { quote?: unknown; holdings?: unknown[]; balances?: unknown[] };

const sourceFor = (market: "VN" | "US") => market === "VN" ? "MCP + DNSE" as const : "MCP + Finnhub" as const;
const formatUsd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const formatVnd = (value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) + " VND";
const timeText = (timestamp: string | null, market: "VN" | "US") => timestamp
  ? ` Dữ liệu lúc ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", ...(market === "US" ? { timeZone: "America/New_York" } : { timeZone: "Asia/Ho_Chi_Minh" }) }).format(new Date(timestamp))}${market === "US" ? " giờ New York." : " giờ Việt Nam."}`
  : "";

async function compareHolding(symbolInput: string): Promise<StockMateToolOutput> {
  const symbol = symbolInput.trim().toUpperCase();
  const portfolio = await getMainPortfolio();
  const holding = await prisma.holding.findFirst({ where: { portfolioId: portfolio.id, ticker: symbol } });
  if (!holding) return { answer: `Bạn chưa thêm ${symbol} vào danh mục nên mình chưa thể so sánh giá mua với giá hiện tại.`, source: "MCP + DNSE" };

  const market = holding.currency === "USD" ? "US" : "VN";
  const source = sourceFor(market);
  const quote = market === "VN" ? await getDnseQuote(symbol) : await getFinnhubQuote(symbol);
  if (!quote) return { answer: `${source === "MCP + DNSE" ? "DNSE" : "Finnhub"} chưa tìm thấy báo giá cho ${symbol}.`, source };

  const currency = market === "VN" ? "VND" : "USD";
  const format = market === "VN" ? formatVnd : formatUsd;
  const costBasis = holding.quantity * holding.averagePrice;
  const marketValue = holding.quantity * quote.price;
  const unrealizedPnl = marketValue - costBasis;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
  return {
    answer: `So sánh khoản đầu tư ${symbol}: vốn mua ${format(costBasis)}, giá trị hiện tại ${format(marketValue)}, lãi/lỗ tạm tính ${unrealizedPnl >= 0 ? "+" : "−"}${format(Math.abs(unrealizedPnl))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%).${timeText(quote.timestamp, market)} Nguồn: ${market === "VN" ? "DNSE" : "Finnhub"}.`,
    comparison: { ticker: symbol, quantity: holding.quantity, currency, averagePrice: holding.averagePrice, currentPrice: quote.price, costBasis, marketValue, unrealizedPnl, pnlPercent, currencyMismatch: false },
    fetchedAt: quote.timestamp,
    source,
  };
}

async function getStockQuote(symbolInput: string, market: "VN" | "US"): Promise<StockMateToolOutput> {
  const symbol = symbolInput.trim().toUpperCase();
  const source = sourceFor(market);
  const quote = market === "VN" ? await getDnseQuote(symbol) : await getFinnhubQuote(symbol);
  if (!quote) return { answer: `${market === "VN" ? "DNSE" : "Finnhub"} chưa tìm thấy báo giá cho ${symbol}.`, source };
  if (market === "VN") {
    return {
      answer: `Giá khớp gần nhất của ${symbol}: ${formatVnd(quote.price)}.${timeText(quote.timestamp, market)} Nguồn: DNSE.`,
      quote,
      fetchedAt: quote.timestamp,
      source,
    };
  }
  if (!("change" in quote)) return { answer: `Finnhub chưa trả đủ dữ liệu biến động cho ${symbol}.`, source };
  const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
  return {
    answer: `${symbol} ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% so với giá đóng cửa trước. Giá gần nhất ${formatUsd(quote.price)}.${timeText(quote.timestamp, market)} Nguồn: Finnhub.`,
    quote,
    fetchedAt: quote.timestamp,
    source,
  };
}

async function summarizePortfolio(): Promise<StockMateToolOutput> {
  const portfolio = await getMainPortfolio();
  const holdings = await prisma.holding.findMany({ where: { portfolioId: portfolio.id }, orderBy: { ticker: "asc" } });
  if (!holdings.length) return { answer: "Danh mục của bạn chưa có mã cổ phiếu nào.", holdings: [], source: "MCP + DNSE" };

  const rows = await Promise.all(holdings.map(async (holding) => {
    try {
      const market = holding.currency === "USD" ? "US" : "VN";
      const quote = market === "VN" ? await getDnseQuote(holding.ticker) : await getFinnhubQuote(holding.ticker);
      if (!quote) return { ticker: holding.ticker, quantity: holding.quantity, currency: holding.currency, quoteAvailable: false };
      const costBasis = holding.quantity * holding.averagePrice;
      const marketValue = holding.quantity * quote.price;
      const unrealizedPnl = marketValue - costBasis;
      return {
        ticker: holding.ticker,
        quantity: holding.quantity,
        currency: holding.currency,
        averagePrice: holding.averagePrice,
        currentPrice: quote.price,
        quoteAvailable: true,
        costBasis, marketValue, unrealizedPnl, source: market === "VN" ? "DNSE" : "Finnhub",
      };
    } catch {
      return { ticker: holding.ticker, quantity: holding.quantity, currency: holding.currency, quoteAvailable: false };
    }
  }));
  const available = rows.filter((row) => row.quoteAvailable);
  const answer = available.length
    ? `Đã lấy được báo giá cho ${available.length}/${holdings.length} mã trong danh mục từ DNSE (mã Việt Nam) và Finnhub (mã Mỹ).`
    : "Chưa lấy được báo giá cho các mã trong danh mục. Kiểm tra credentials DNSE/Finnhub và thử lại.";
  return { answer, holdings: rows, fetchedAt: new Date().toISOString(), source: "MCP + DNSE" };
}

async function getDnseCashBalance(): Promise<StockMateToolOutput> {
  const rawBalances = await getDnseAccountBalances();
  const balances = rawBalances.map((account) => ({
    accountNo: `••••${account.accountNo.slice(-4)}`,
    sections: account.sections,
  }));
  const details = balances.flatMap((account) => account.sections.map((section) => {
    const maskedAccount = account.accountNo;
    const amounts = section.amounts
      .map(({ field, value }) => `${field}: ${formatVnd(value)}`)
      .join(", ");
    return `${maskedAccount} · ${section.name}: ${amounts}`;
  }));
  const answer = details.length
    ? `Đã đọc số dư từ DNSE (chỉ đọc). ${details.join("; ")}. Đây là số dư theo từng mục DNSE trả về; không đồng nhất sức mua với tiền mặt khả dụng.`
    : "DNSE đã phản hồi nhưng không có trường số dư dạng số để hiển thị. Kiểm tra phiên bản API hoặc cấu trúc response DNSE.";
  return { answer, balances, fetchedAt: new Date().toISOString(), source: "MCP + DNSE" };
}

async function getDnsePositionsSummary(): Promise<StockMateToolOutput> {
  const valuation = await getDnseValuation();
  const sample = valuation.source === "MOCK" ? " (DỮ LIỆU MẪU — chưa đọc tài khoản thật)" : "";
  if (!valuation.positions.length) {
    return {
      answer: `Tài khoản DNSE hiện chưa nắm giữ cổ phiếu nào${sample}. Tiền: ${formatVnd(valuation.cash)}.`,
      holdings: [],
      fetchedAt: valuation.valuedAt,
      source: "MCP + DNSE",
    };
  }
  const lines = [...valuation.positions]
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((item) => {
      const pnlPercent = item.costPrice > 0 ? ((item.price - item.costPrice) / item.costPrice) * 100 : 0;
      return `${item.symbol}: ${item.quantity} cp, giá vốn ${formatVnd(item.costPrice)}, giá hiện tại ${formatVnd(item.price)}, lãi/lỗ ${item.pnl >= 0 ? "+" : "−"}${formatVnd(Math.abs(item.pnl))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%)`;
    });
  const pnlPercent = valuation.costValue > 0 ? (valuation.pnl / valuation.costValue) * 100 : 0;
  return {
    answer: `Vị thế trên DNSE${sample}: ${lines.join("; ")}. Tổng giá trị cổ phiếu ${formatVnd(valuation.stockValue)}, lãi/lỗ tạm tính ${valuation.pnl >= 0 ? "+" : "−"}${formatVnd(Math.abs(valuation.pnl))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%). Tài sản ròng ${formatVnd(valuation.netAssets)}. Chỉ đọc; đây không phải khuyến nghị mua bán.`,
    holdings: valuation.positions.map(({ symbol, quantity, costPrice, price, marketValue, pnl }) => ({ symbol, quantity, costPrice, price, marketValue, pnl })),
    fetchedAt: valuation.valuedAt,
    source: "MCP + DNSE",
  };
}

function registerToolHandler<TArgs extends Record<string, unknown>>(
  server: McpServer,
  name: StockMateToolName,
  description: string,
  inputSchema: z.ZodType<TArgs>,
  handler: (args: TArgs) => Promise<StockMateToolOutput>,
) {
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try {
      const result = await handler(args as TArgs);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lấy dữ liệu StockMate.";
      return { content: [{ type: "text", text: JSON.stringify({ answer: message, source: "MCP + DNSE" }) }], isError: true };
    }
  });
}

export function createStockMateMcpServer() {
  const server = new McpServer({ name: "stockmate-portfolio", version: "1.0.0" });
  const symbolSchema = z.object({ symbol: z.string().min(1).max(12).describe("Mã cổ phiếu, ví dụ FPT") });
  const quoteSchema = symbolSchema.extend({ market: z.enum(["VN", "US"]).describe("VN cho HOSE/HNX/UPCoM; US cho cổ phiếu Mỹ") });
  registerToolHandler(server, "compare_portfolio_holding", "So sánh một mã trong danh mục NHẬP TAY với giá hiện tại: dùng DNSE cho mã Việt Nam (VND), Finnhub cho mã Mỹ (USD), tính giá vốn, giá trị hiện tại và lãi/lỗ. Dùng khi người dùng hỏi giá vốn/lãi lỗ của một mã cụ thể đã lưu (ví dụ AAPL). Với vị thế thật trên DNSE/Entrade X thì dùng get_dnse_positions.", symbolSchema, ({ symbol }) => compareHolding(symbol));
  registerToolHandler(server, "get_stock_quote", "Tra cứu giá cổ phiếu. Chọn market VN cho mã Việt Nam trên HOSE/HNX/UPCoM (DNSE), hoặc US cho mã Mỹ (Finnhub). FPT là mã VN; AAPL là mã US.", quoteSchema, ({ symbol, market }) => getStockQuote(symbol, market));
  registerToolHandler(server, "summarize_portfolio", "Tóm tắt danh mục NHẬP TAY (các mã người dùng tự lưu, gồm cả cổ phiếu Mỹ) kèm giá hiện tại từ DNSE cho mã Việt Nam, Finnhub cho mã Mỹ. Dùng khi người dùng muốn tổng quan danh mục đã lưu.", z.object({}), () => summarizePortfolio());
  registerToolHandler(server, "get_dnse_cash_balance", "Đọc số dư tiền và tài sản trong các tiểu khoản DNSE của người dùng. Chỉ dùng khi người dùng hỏi còn bao nhiêu tiền, số dư tài khoản chứng khoán, hoặc tiền trong ví DNSE. Chỉ đọc, không đặt/hủy lệnh. Nêu rõ các mục DNSE trả về và không gọi sức mua là tiền mặt.", z.object({}), () => getDnseCashBalance());
  registerToolHandler(server, "get_dnse_positions", "Đọc các vị thế cổ phiếu đang nắm giữ trên tài khoản DNSE (Entrade X) thật: mã, khối lượng, giá vốn, giá hiện tại, lãi/lỗ và tổng tài sản. Dùng khi người dùng hỏi đang giữ mã nào, giá vốn, lãi lỗ trên DNSE/Entrade X. Chỉ đọc, không đặt/hủy lệnh.", z.object({}), () => getDnsePositionsSummary());
  return server;
}

/** Tools whose results are the user's own brokerage data: never sent to the LLM or shown in traces. */
export const PRIVATE_TOOLS: ReadonlySet<string> = new Set(["get_dnse_cash_balance", "get_dnse_positions"]);

export type McpToolInfo = { name: string; description: string; inputSchema: Record<string, unknown> };

/**
 * One MCP client session for the in-app assistant, connected over the official
 * JSON-RPC protocol (in-memory transport). The assistant discovers tools with
 * `tools/list` and runs them with `tools/call` — the same calls an external MCP
 * client makes against /api/mcp.
 */
export async function openStockMateSession() {
  const server = createStockMateMcpServer();
  const client = new Client({ name: "stockmate-assistant", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    async listTools(): Promise<McpToolInfo[]> {
      const { tools } = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    },
    async callTool(name: string, args: Record<string, unknown> = {}): Promise<StockMateToolOutput> {
      const result = await client.callTool({ name, arguments: args });
      const text = result.content.find((item) => item.type === "text")?.text;
      if (!text) throw new Error("MCP tool không trả nội dung kết quả.");
      const parsed = JSON.parse(text) as StockMateToolOutput;
      if (result.isError) throw new Error(parsed.answer);
      return parsed;
    },
    async close() {
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
}
