import { Auth, Config, Data } from "@ssi.developer/ssi-sdk";

type SsiMarketClient = { auth: Auth; data: Data };
type SsiGlobal = typeof globalThis & { ssiMarketClient?: SsiMarketClient };

export async function getSsiMarketData() {
  const clientId = process.env.SSI_CLIENT_ID;
  const apiKey = process.env.SSI_API_KEY;
  const apiSecret = process.env.SSI_API_SECRET;
  if (!clientId || !apiKey || !apiSecret) {
    throw new Error("Thiếu SSI_CLIENT_ID, SSI_API_KEY hoặc SSI_API_SECRET trong .env.");
  }

  const globalForSsi = globalThis as SsiGlobal;
  const client = globalForSsi.ssiMarketClient ?? (() => {
    const config = new Config({ clientId, apiKey, apiSecret, timeout: 15_000, maxRetries: 1 });
    const auth = new Auth(config);
    const newClient = { auth, data: new Data(auth) };
    globalForSsi.ssiMarketClient = newClient;
    return newClient;
  })();

  await client.auth.ensureAuthenticated();
  return client.data.marketData;
}

export async function getSsiQuote(symbol: string) {
  const marketData = await getSsiMarketData();
  const [summaries, security] = await Promise.all([
    marketData.getSecuritiesSummary(symbol, 1, 5),
    marketData.getSecuritiesInfo(symbol),
  ]);
  const latest = summaries[0];
  if (!latest) return null;

  return {
    symbol: latest.symbol,
    name: security?.symbolNameVi || security?.symbolNameEn || latest.symbol,
    exchange: security?.board ?? null,
    tradingDate: latest.tradingDate,
    price: latest.closePrice,
    change: latest.priceChange,
    changePercent: latest.priceChangePercent,
    open: latest.openPrice,
    high: latest.highPrice,
    low: latest.lowPrice,
    average: latest.averagePrice,
    volume: latest.totalMatch,
    source: "SSI FastConnect",
    fetchedAt: new Date().toISOString(),
  };
}
