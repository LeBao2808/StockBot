export type Market = "HOSE" | "HNX" | "UPCOM" | "US";

export type Holding = {
  id: string;
  ticker: string;
  name: string;
  market: Market;
  currency: "VND" | "USD";
  shares: number;
  price: number;
  currentPrice: number | null;
  change: number | null;
};

export type PortfolioComparison = {
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

/** One step of how the assistant answered: MCP tool discovery, an LLM round, or an MCP tool call. */
export type TraceStep =
  | { kind: "list"; ms: number; tools: string[] }
  | { kind: "llm"; ms: number; decision: string[] }
  | { kind: "call"; ms: number; name: string; args: Record<string, unknown>; ok: boolean; result?: string; redacted?: boolean };

export type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  comparison?: PortfolioComparison;
  streaming?: boolean;
  trace?: TraceStep[];
};

export type UsQuote = {
  symbol: string;
  currency: "USD";
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string | null;
  source: "Finnhub";
};

export type AppSection = "overview" | "portfolio" | "markets" | "performance";
