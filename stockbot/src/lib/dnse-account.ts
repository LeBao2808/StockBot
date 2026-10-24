import accountsSample from "../../docs/dnse-samples/accounts.json";
import balancesSample from "../../docs/dnse-samples/balances.json";
import positionsSample from "../../docs/dnse-samples/positions-stock.json";
import { asRecord, getDnseAccountNos, getDnseJson } from "@/lib/dnse-market";

// Read-only views of the DNSE (Entrade X) account. Only GET endpoints are
// called; nothing here needs a trading token.

export type DnseSource = "DNSE" | "MOCK";

export type DnsePosition = {
  id: string;
  accountNo: string;
  symbol: string;
  status: string;
  /** Open quantity (`openQuantity`). */
  quantity: number;
  /** Quantity that can be sold now (`tradeQuantity`). */
  availableQuantity: number;
  /** Average cost of the open quantity, in VND. */
  costPrice: number;
  /** DNSE's market price in VND, when provided. */
  marketPrice: number | null;
  breakEvenPrice: number | null;
  openedAt: string | null;
};

export type DnseCash = {
  accountNo: string;
  totalCash: number;
  availableCash: number;
  withdrawableCash: number;
  totalDebt: number;
  orderSecured: number;
  cashDividendReceiving: number;
};

/** True when DNSE_MOCK=1 or credentials are missing; data then comes from docs/dnse-samples. */
export function isDnseMock() {
  return process.env.DNSE_MOCK === "1" || !process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET;
}

function num(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/**
 * Stock prices from DNSE market data are in thousands of VND. The positions
 * endpoint's unit is not documented for stocks (verified only for derivatives),
 * so treat anything below 1,000 as thousands — no listed stock trades under
 * 1,000 VND per share once expressed in VND.
 */
function toVnd(value: unknown): number | null {
  const number = num(value);
  if (number === null || number <= 0) return null;
  return number < 1000 ? Math.round(number * 1000) : number;
}

function parsePositions(payload: unknown, fallbackAccountNo: string): DnsePosition[] {
  const list = asRecord(payload)?.positions;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const item = asRecord(raw);
    const symbol = typeof item?.symbol === "string" ? item.symbol.toUpperCase() : "";
    const quantity = num(item?.openQuantity) ?? 0;
    const costPrice = toVnd(item?.costPrice);
    if (!item || !symbol || quantity <= 0 || costPrice === null || item.status === "CLOSED") return [];
    return [{
      id: String(item.id ?? `${fallbackAccountNo}-${symbol}`),
      accountNo: String(item.accountNo ?? fallbackAccountNo),
      symbol,
      status: String(item.status ?? "OPEN"),
      quantity,
      availableQuantity: num(item.tradeQuantity) ?? quantity,
      costPrice,
      marketPrice: toVnd(item.marketPrice),
      breakEvenPrice: toVnd(item.breakEvenPrice),
      openedAt: typeof item.createdDate === "string" ? item.createdDate : null,
    }];
  });
}

function parseCash(payload: unknown, accountNo: string): DnseCash {
  const stock = asRecord(asRecord(payload)?.stock) ?? {};
  const amount = (key: string) => num(stock[key]) ?? 0;
  return {
    accountNo,
    totalCash: amount("totalCash"),
    availableCash: amount("availableCash"),
    withdrawableCash: amount("withdrawableCash"),
    totalDebt: amount("totalDebt"),
    orderSecured: amount("orderSecured"),
    cashDividendReceiving: amount("cashDividendReceiving"),
  };
}

/** Open stock positions across the eligible sub-accounts. */
export async function getDnsePositions(): Promise<{ source: DnseSource; positions: DnsePosition[] }> {
  if (isDnseMock()) {
    return { source: "MOCK", positions: parsePositions(positionsSample, accountsSample.accounts[0].id) };
  }
  const accountNos = await getDnseAccountNos();
  const perAccount = await Promise.all(accountNos.map(async (accountNo) =>
    parsePositions(
      await getDnseJson(`/accounts/${encodeURIComponent(accountNo)}/positions`, "?marketType=STOCK"),
      accountNo,
    )));
  return { source: "DNSE", positions: perAccount.flat() };
}

/** Stock-account cash per eligible sub-account, in VND. */
export async function getDnseCash(): Promise<{ source: DnseSource; accounts: DnseCash[] }> {
  if (isDnseMock()) {
    return { source: "MOCK", accounts: [parseCash(balancesSample, accountsSample.accounts[0].id)] };
  }
  const accountNos = await getDnseAccountNos();
  const accounts = await Promise.all(accountNos.map(async (accountNo) =>
    parseCash(await getDnseJson(`/accounts/${encodeURIComponent(accountNo)}/balances`), accountNo)));
  return { source: "DNSE", accounts };
}
