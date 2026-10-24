import { asRecord, getDnseInstruments, getDnseJson, getDnseOhlc, type Instrument } from "@/lib/dnse-market";

// Price-board data in the shape Entrade X shows ("Bước giá" tab).
// DNSE units, verified against Entrade X and daily OHLC volume on 2026-10-23:
// - prices are thousands of VND            → ×1,000
// - trade/quote quantities are lots of 10  → ×10 (every exchange)
// - grossTradeAmount is billions of VND    → ×1e9

const PRICE = 1000;
const LOT = 10;
const DAY = 86_400;
const VN_OFFSET = 7 * 3600;

export type PriceLevel = { price: number; quantity: number };

export type SessionPrices = { reference: number; ceiling: number; floor: number };

export type Board = {
  symbol: string;
  name: string;
  exchange: Instrument["exchange"] | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  session: (SessionPrices & { estimated: boolean }) | null;
  /** Set after the close, when DNSE already publishes the next session's prices. */
  nextSession: (SessionPrices & { date: string }) | null;
  open: number | null;
  high: number | null;
  low: number | null;
  average: number | null;
  volume: number | null;
  value: number | null;
  bids: PriceLevel[];
  asks: PriceLevel[];
  totalBid: number;
  totalAsk: number;
  foreign: { buyVolume: number; sellVolume: number; room: number | null } | null;
  tradeTime: string | null;
};

const num = (value: unknown) => {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};
const vnd = (value: unknown) => {
  const number = num(value);
  return number !== null && number > 0 ? Math.round(number * PRICE) : null;
};

/** Parses DNSE "YYYY-MM-DD HH:mm:ss.SSS" (Vietnam time) into a Date. */
function parseVnTime(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(`${value.replace(" ", "T")}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function vnDateKey(date: Date) {
  return new Date(date.getTime() + VN_OFFSET * 1000).toISOString().slice(0, 10);
}

/** Price step for a stock at `price` VND. */
function tickSize(price: number, exchange: Instrument["exchange"] | null) {
  if (exchange !== "HOSE") return 100;
  if (price < 10_000) return 10;
  if (price < 50_000) return 50;
  return 100;
}

const BANDS: Partial<Record<Instrument["exchange"], number>> = { HOSE: 0.07, HNX: 0.1, UPCOM: 0.15 };

/** Ceiling/floor from a reference price using the exchange's daily band. */
function bandPrices(reference: number, exchange: Instrument["exchange"] | null): SessionPrices | null {
  const band = exchange ? BANDS[exchange] : undefined;
  if (!band) return null;
  const up = reference * (1 + band);
  const down = reference * (1 - band);
  return {
    reference,
    ceiling: Math.floor(up / tickSize(up, exchange) + 1e-9) * tickSize(up, exchange),
    floor: Math.ceil(down / tickSize(down, exchange) - 1e-9) * tickSize(down, exchange),
  };
}

function nextWeekday(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function levels(value: unknown): PriceLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = asRecord(raw);
    const price = vnd(item?.price);
    const quantity = num(item?.quantity);
    return price !== null && quantity !== null ? [{ price, quantity: quantity * LOT }] : [];
  });
}

export async function getBoard(rawSymbol: string): Promise<Board> {
  const symbol = rawSymbol.trim().toUpperCase();
  const path = (suffix: string) => `/price/${encodeURIComponent(symbol)}/${suffix}`;
  const optional = <T>(promise: Promise<T>) => promise.catch(() => null);
  const now = Math.floor(Date.now() / 1000);

  const [instruments, tradePayload, quotePayload, secdefPayload, candles] = await Promise.all([
    optional(getDnseInstruments()),
    getDnseJson(path("trades/latest"), "?boardId=G1"),
    optional(getDnseJson(path("quotes/latest"), "?boardId=G1")),
    optional(getDnseJson(path("secdef"), "?boardId=G1")),
    optional(getDnseOhlc(symbol, "1D", now - 20 * DAY, now)),
  ]);

  const instrument = instruments?.find((item) => item.symbol === symbol);
  const exchange = instrument?.exchange ?? null;
  const trades = asRecord(tradePayload)?.trades;
  const trade = asRecord(Array.isArray(trades) ? trades[0] : null);
  const quotes = asRecord(quotePayload)?.quotes;
  const quote = asRecord(Array.isArray(quotes) ? quotes[0] : null);
  const secdef = asRecord(Array.isArray(secdefPayload) ? secdefPayload[0] : null);

  const tradeTime = parseVnTime(trade?.time);
  const sessionKey = tradeTime ? vnDateKey(tradeTime) : null;
  const secdefTime = parseVnTime(secdef?.time);
  const secdefPrices: SessionPrices | null =
    vnd(secdef?.basicPrice) && vnd(secdef?.ceilingPrice) && vnd(secdef?.floorPrice)
      ? { reference: vnd(secdef?.basicPrice)!, ceiling: vnd(secdef?.ceilingPrice)!, floor: vnd(secdef?.floorPrice)! }
      : null;
  // After ~15:00 DNSE rolls secdef over to the next session.
  const secdefIsNext =
    !!secdefTime && !!sessionKey && (vnDateKey(secdefTime) > sessionKey || (vnDateKey(secdefTime) === sessionKey && secdefTime.getUTCHours() + 7 >= 15));

  let session: Board["session"] = null;
  if (secdefPrices && !secdefIsNext) {
    session = { ...secdefPrices, estimated: false };
  } else if (sessionKey && candles?.length) {
    // Reference for the session = previous session's close (UPCoM actually uses the
    // previous average price, hence "estimated").
    const previous = [...candles].reverse().find((candle) => vnDateKey(new Date(candle.time * 1000)) < sessionKey);
    const band = previous ? bandPrices(previous.close, exchange) : null;
    if (band) session = { ...band, estimated: exchange === "UPCOM" };
  }

  const price = vnd(trade?.matchPrice);
  const change = price !== null && session ? price - session.reference : null;
  const bids = levels(quote?.bid);
  const asks = levels(quote?.offer);

  let foreign: Board["foreign"] = null;
  if (tradeTime && sessionKey) {
    const start = Math.floor(new Date(`${sessionKey}T00:00:00+07:00`).getTime() / 1000);
    const payload = await optional(
      getDnseJson(path("foreign-trading"), `?boardId=G1&from=${start}&to=${start + DAY - 1}&limit=1&order=DESC`),
    );
    const list = asRecord(payload)?.foreigners;
    const row = asRecord(Array.isArray(list) ? list[0] : null);
    if (row)
      foreign = {
        buyVolume: num(row.totalBuyVolume) ?? 0,
        sellVolume: num(row.totalSellVolume) ?? 0,
        room: num(row.foreignerOrderLimitQuantity),
      };
  }

  const grossBillion = num(trade?.grossTradeAmount);
  const totalVolume = num(trade?.totalVolumeTraded);
  return {
    symbol,
    name: instrument?.name ?? "",
    exchange,
    price,
    change,
    changePercent: change !== null && session ? (change / session.reference) * 100 : null,
    session,
    nextSession: secdefIsNext && secdefPrices && sessionKey ? { ...secdefPrices, date: nextWeekday(sessionKey) } : null,
    open: vnd(trade?.openPrice),
    high: vnd(trade?.highestPrice),
    low: vnd(trade?.lowestPrice),
    average: vnd(trade?.avgPrice),
    volume: totalVolume !== null ? totalVolume * LOT : null,
    value: grossBillion !== null ? Math.round(grossBillion * 1e9) : null,
    bids,
    asks,
    totalBid: bids.reduce((sum, level) => sum + level.quantity, 0),
    totalAsk: asks.reduce((sum, level) => sum + level.quantity, 0),
    foreign,
    tradeTime: tradeTime?.toISOString() ?? null,
  };
}

export type HotStock = {
  symbol: string;
  name: string;
  exchange: Instrument["exchange"];
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  /** close × volume — an approximation of traded value, in VND. */
  value: number;
  /** Today's volume ÷ 20-session average volume. */
  volumeRatio: number | null;
  closes: number[];
};

const HOT_UNIVERSE = ["VN100", "HNX30"];
const HOT_TTL = 2 * 60_000;
let hotCache: { at: number; data: { session: string | null; stocks: HotStock[] } } | null = null;
let hotInFlight: Promise<{ session: string | null; stocks: HotStock[] }> | null = null;

async function indexMembers(indexName: string) {
  const payload = asRecord(await getDnseJson("/market/instruments", `?indexName=${indexName}&limit=500`));
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.flatMap((raw) => {
    const item = asRecord(raw);
    return typeof item?.symbol === "string" ? [item.symbol.toUpperCase()] : [];
  });
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

async function computeHotStocks() {
  const [instruments, ...members] = await Promise.all([getDnseInstruments(), ...HOT_UNIVERSE.map(indexMembers)]);
  const bySymbol = new Map(instruments.map((item) => [item.symbol, item]));
  const symbols = [...new Set(members.flat())];
  const now = Math.floor(Date.now() / 1000);

  const rows = await mapLimit(symbols, 12, async (symbol) => {
    const candles = await getDnseOhlc(symbol, "1D", now - 45 * DAY, now).catch(() => []);
    const last = candles.at(-1);
    const previous = candles.at(-2);
    const instrument = bySymbol.get(symbol);
    if (!last || !previous || !instrument) return null;
    const history = candles.slice(-21, -1);
    const averageVolume = history.length ? history.reduce((sum, candle) => sum + candle.volume, 0) / history.length : 0;
    return {
      symbol,
      name: instrument.name,
      exchange: instrument.exchange,
      price: last.close,
      change: last.close - previous.close,
      changePercent: ((last.close - previous.close) / previous.close) * 100,
      volume: last.volume,
      value: last.close * last.volume,
      volumeRatio: averageVolume > 0 ? last.volume / averageVolume : null,
      closes: candles.slice(-20).map((candle) => candle.close),
      time: last.time,
    };
  });

  const valid = rows.filter((row) => row !== null);
  // Only rank symbols that traded in the latest session.
  const latest = Math.max(0, ...valid.map((row) => row.time));
  const stocks: HotStock[] = valid
    .filter((row) => row.time === latest)
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange,
      price: row.price,
      change: row.change,
      changePercent: row.changePercent,
      volume: row.volume,
      value: row.value,
      volumeRatio: row.volumeRatio,
      closes: row.closes,
    }));
  return { session: latest ? vnDateKey(new Date(latest * 1000)) : null, stocks };
}

/** Latest-session stats for VN100 + HNX30, cached for 2 minutes and shared by concurrent callers. */
export async function getHotStocks() {
  if (hotCache && Date.now() - hotCache.at < HOT_TTL) return hotCache.data;
  hotInFlight ??= computeHotStocks()
    .then((data) => {
      hotCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      hotInFlight = null;
    });
  return hotInFlight;
}
