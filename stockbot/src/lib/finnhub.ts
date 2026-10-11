export type FinnhubQuote = {
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

export async function getFinnhubQuote(rawSymbol: string): Promise<FinnhubQuote | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("Thiếu FINNHUB_API_KEY trong .env.");

  const symbol = rawSymbol.trim().toUpperCase();
  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", symbol);

  const response = await fetch(url, {
    headers: { "X-Finnhub-Token": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Finnhub từ chối API key. Hãy kiểm tra FINNHUB_API_KEY.");
  }
  if (response.status === 429) throw new Error("Finnhub đã hết lượt gọi cho thời điểm này. Hãy thử lại sau.");
  if (!response.ok) throw new Error(`Finnhub trả lỗi HTTP ${response.status}.`);

  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Finnhub trả dữ liệu không hợp lệ.");
  const quote = data as Record<string, unknown>;
  const price = Number(quote.c);
  const previousClose = Number(quote.pc);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(previousClose) || previousClose <= 0) return null;

  const epoch = Number(quote.t);
  return {
    symbol,
    currency: "USD",
    price,
    change: Number(quote.d) || price - previousClose,
    changePercent: Number(quote.dp) || ((price - previousClose) / previousClose) * 100,
    high: Number(quote.h) || 0,
    low: Number(quote.l) || 0,
    open: Number(quote.o) || 0,
    previousClose,
    timestamp: epoch > 0 ? new Date(epoch * 1000).toISOString() : null,
    source: "Finnhub",
  };
}
