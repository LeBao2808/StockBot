import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { getFinnhubQuote } from "@/lib/finnhub";
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
  source: "MCP + Finnhub";
};

export type StockMateToolName = "compare_portfolio_holding" | "get_stock_quote" | "summarize_portfolio";
export type StockMateToolOutput = ComparisonToolResult & { quote?: unknown; holdings?: unknown[] };

const source = "MCP + Finnhub" as const;
const formatUsd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const timeText = (timestamp: string | null) => timestamp
  ? ` Dữ liệu lúc ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(timestamp))} giờ New York.`
  : "";

async function compareHolding(symbolInput: string): Promise<StockMateToolOutput> {
  const symbol = symbolInput.trim().toUpperCase();
  const portfolio = await getMainPortfolio();
  const holding = await prisma.holding.findFirst({ where: { portfolioId: portfolio.id, ticker: symbol } });
  if (!holding) return { answer: `Bạn chưa thêm ${symbol} vào danh mục nên mình chưa thể so sánh giá mua với giá hiện tại.`, source };

  const quote = await getFinnhubQuote(symbol);
  if (!quote) return { answer: `Finnhub hiện chưa có giá cho ${symbol}, nên mình chưa thể tính giá trị danh mục.`, source };
  if (holding.currency !== "USD") {
    return {
      answer: `${symbol} đang được lưu với giá vốn bằng ${holding.currency}, trong khi Finnhub trả giá bằng USD. Mình không cộng trừ khác đơn vị tiền tệ. Hãy sửa mã sang thị trường Mỹ (USD), rồi hỏi lại.`,
      comparison: { ticker: symbol, quantity: holding.quantity, currency: holding.currency, averagePrice: holding.averagePrice, currentPrice: quote.price, currencyMismatch: true },
      fetchedAt: quote.timestamp,
      source,
    };
  }

  const costBasis = holding.quantity * holding.averagePrice;
  const marketValue = holding.quantity * quote.price;
  const unrealizedPnl = marketValue - costBasis;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
  return {
    answer: `So sánh khoản đầu tư ${symbol}: vốn mua ${formatUsd(costBasis)}, giá trị hiện tại ${formatUsd(marketValue)}, lãi/lỗ tạm tính ${unrealizedPnl >= 0 ? "+" : "−"}${formatUsd(Math.abs(unrealizedPnl))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%).${timeText(quote.timestamp)} Giá thị trường từ Finnhub.`,
    comparison: { ticker: symbol, quantity: holding.quantity, currency: "USD", averagePrice: holding.averagePrice, currentPrice: quote.price, costBasis, marketValue, unrealizedPnl, pnlPercent, currencyMismatch: false },
    fetchedAt: quote.timestamp,
    source,
  };
}

async function getStockQuote(symbolInput: string): Promise<StockMateToolOutput> {
  const symbol = symbolInput.trim().toUpperCase();
  const quote = await getFinnhubQuote(symbol);
  if (!quote) return { answer: `Finnhub chưa tìm thấy báo giá cho ${symbol}.`, source };
  const direction = quote.change > 0 ? "tăng" : quote.change < 0 ? "giảm" : "đi ngang";
  return {
    answer: `${symbol} ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% so với giá đóng cửa trước. Giá gần nhất ${formatUsd(quote.price)}.${timeText(quote.timestamp)} Nguồn: Finnhub.`,
    quote,
    fetchedAt: quote.timestamp,
    source,
  };
}

async function summarizePortfolio(): Promise<StockMateToolOutput> {
  const portfolio = await getMainPortfolio();
  const holdings = await prisma.holding.findMany({ where: { portfolioId: portfolio.id }, orderBy: { ticker: "asc" } });
  if (!holdings.length) return { answer: "Danh mục của bạn chưa có mã cổ phiếu nào.", holdings: [], source };

  const rows = await Promise.all(holdings.map(async (holding) => {
    try {
      const quote = await getFinnhubQuote(holding.ticker);
      if (!quote) return { ticker: holding.ticker, quantity: holding.quantity, currency: holding.currency, quoteAvailable: false };
      const compatible = holding.currency === "USD";
      const costBasis = compatible ? holding.quantity * holding.averagePrice : undefined;
      const marketValue = compatible ? holding.quantity * quote.price : undefined;
      const unrealizedPnl = compatible ? marketValue! - costBasis! : undefined;
      return {
        ticker: holding.ticker,
        quantity: holding.quantity,
        currency: holding.currency,
        averagePrice: holding.averagePrice,
        currentPrice: quote.price,
        quoteAvailable: true,
        ...(compatible ? { costBasis, marketValue, unrealizedPnl } : { currencyMismatch: true }),
      };
    } catch {
      return { ticker: holding.ticker, quantity: holding.quantity, currency: holding.currency, quoteAvailable: false };
    }
  }));
  const available = rows.filter((row) => row.quoteAvailable);
  const answer = available.length
    ? `Đây là dữ liệu Finnhub cho ${available.length}/${holdings.length} mã trong danh mục. Các con số từng mã được giữ theo đơn vị tiền tệ đã lưu; những mã không khớp USD sẽ không có phép tính lãi/lỗ.`
    : "Finnhub chưa trả được báo giá cho các mã trong danh mục của bạn.";
  return { answer, holdings: rows, fetchedAt: new Date().toISOString(), source };
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
      return { content: [{ type: "text", text: JSON.stringify({ answer: message, source }) }], isError: true };
    }
  });
}

export function createStockMateMcpServer() {
  const server = new McpServer({ name: "stockmate-portfolio", version: "1.0.0" });
  const symbolSchema = z.object({ symbol: z.string().min(1).max(12).describe("Mã cổ phiếu, ví dụ AAPL") });
  registerToolHandler(server, "compare_portfolio_holding", "So sánh một mã đã lưu với giá Finnhub mới nhất, gồm giá vốn, giá trị hiện tại và lãi/lỗ chưa chốt.", symbolSchema, ({ symbol }) => compareHolding(symbol));
  registerToolHandler(server, "get_stock_quote", "Tra cứu giá cổ phiếu Mỹ mới nhất cùng mức biến động từ Finnhub.", symbolSchema, ({ symbol }) => getStockQuote(symbol));
  registerToolHandler(server, "summarize_portfolio", "Tóm tắt các mã trong danh mục StockMate và báo giá Finnhub có thể lấy được.", z.object({}), () => summarizePortfolio());
  return server;
}

/** StockMate's assistant calls MCP tools through the official MCP JSON-RPC client/server protocol. */
export async function callStockMateTool(name: StockMateToolName, args: Record<string, string> = {}): Promise<StockMateToolOutput> {
  const server = createStockMateMcpServer();
  const client = new Client({ name: "stockmate-assistant", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("MCP tool không trả nội dung kết quả.");
    const parsed = JSON.parse(text) as StockMateToolOutput;
    if (result.isError) throw new Error(parsed.answer);
    return parsed;
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}
