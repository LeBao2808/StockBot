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

const formatUsd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

async function compareHolding(symbolInput: string): Promise<ComparisonToolResult> {
  const symbol = symbolInput.trim().toUpperCase();
  const portfolio = await getMainPortfolio();
  const holding = await prisma.holding.findFirst({
    where: { portfolioId: portfolio.id, ticker: symbol },
  });

  if (!holding) {
    return { answer: `Bạn chưa thêm ${symbol} vào danh mục nên mình chưa thể so sánh giá mua với giá hiện tại.`, source: "MCP + Finnhub" };
  }

  const quote = await getFinnhubQuote(symbol);
  if (!quote) {
    return { answer: `Finnhub hiện chưa có giá cho ${symbol}, nên chưa thể tính giá trị danh mục.`, source: "MCP + Finnhub" };
  }

  if (holding.currency !== "USD") {
    return {
      answer: `${symbol} đang được lưu với giá vốn bằng ${holding.currency}, trong khi Finnhub trả giá bằng USD. Mình không cộng trừ khác đơn vị tiền tệ. Hãy sửa mã sang thị trường Mỹ (USD), rồi hỏi lại.`,
      comparison: {
        ticker: symbol,
        quantity: holding.quantity,
        currency: holding.currency,
        averagePrice: holding.averagePrice,
        currentPrice: quote.price,
        currencyMismatch: true,
      },
      fetchedAt: quote.timestamp,
      source: "MCP + Finnhub",
    };
  }

  const costBasis = holding.quantity * holding.averagePrice;
  const marketValue = holding.quantity * quote.price;
  const unrealizedPnl = marketValue - costBasis;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
  const timestamp = quote.timestamp
    ? ` Dữ liệu lúc ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(quote.timestamp))} giờ New York.`
    : "";

  return {
    answer: `So sánh khoản đầu tư ${symbol}: vốn mua ${formatUsd(costBasis)}, giá trị hiện tại ${formatUsd(marketValue)}, lãi/lỗ tạm tính ${unrealizedPnl >= 0 ? "+" : "−"}${formatUsd(Math.abs(unrealizedPnl))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%).${timestamp} Giá thị trường từ Finnhub.`,
    comparison: {
      ticker: symbol,
      quantity: holding.quantity,
      currency: "USD",
      averagePrice: holding.averagePrice,
      currentPrice: quote.price,
      costBasis,
      marketValue,
      unrealizedPnl,
      pnlPercent,
      currencyMismatch: false,
    },
    fetchedAt: quote.timestamp,
    source: "MCP + Finnhub",
  };
}

export function createStockMateMcpServer() {
  const server = new McpServer({ name: "stockmate-portfolio", version: "1.0.0" });
  server.registerTool(
    "compare_portfolio_holding",
    {
      description: "Compare a stock position saved in StockMate with its latest Finnhub quote, including cost basis, current value, and unrealized profit or loss.",
      inputSchema: z.object({ symbol: z.string().min(1).max(12).describe("Ticker symbol, for example AAPL") }),
    },
    async ({ symbol }) => {
      try {
        const result = await compareHolding(symbol);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not compare this holding.";
        return { content: [{ type: "text", text: JSON.stringify({ answer: message, source: "MCP + Finnhub" }) }], isError: true };
      }
    },
  );
  return server;
}

/** StockMate's assistant is an MCP host: it discovers and calls the registered tool through MCP JSON-RPC. */
export async function callStockMateComparisonTool(symbol: string): Promise<ComparisonToolResult> {
  const server = createStockMateMcpServer();
  const client = new Client({ name: "stockmate-assistant", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "compare_portfolio_holding", arguments: { symbol } });
    const text = result.content.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("MCP tool không trả nội dung kết quả.");
    const parsed = JSON.parse(text) as ComparisonToolResult;
    if (result.isError) throw new Error(parsed.answer);
    return parsed;
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}
