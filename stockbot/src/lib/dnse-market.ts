import { createHmac, randomUUID } from "node:crypto";

export type DnseQuote = {
  symbol: string;
  price: number;
  timestamp: string | null;
  source: "DNSE";
};

function formatDnseDate(date: Date) {
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${weekday}, ${pad(date.getUTCDate())} ${month} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

function signRequest(path: string, date: string, nonce: string, secret: string) {
  const signingString = `(request-target): get ${path}\ndate: ${date}\nnonce: ${nonce}`;
  const signature = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(signingString, "utf8")
    .digest("base64")
    .replace(/\+/g, "%2B")
    .replace(/\//g, "%2F")
    .replace(/=/g, "%3D");

  return `Signature keyId="${process.env.DNSE_API_KEY}",algorithm="hmac-sha256",headers="(request-target) date",signature="${signature}",nonce="${nonce}"`;
}

async function getDnseJson(path: string, query = "") {
  const apiKey = process.env.DNSE_API_KEY;
  const apiSecret = process.env.DNSE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Thiếu DNSE_API_KEY hoặc DNSE_API_SECRET trong .env. Hãy đăng ký Lightspeed API của DNSE.");

  const date = formatDnseDate(new Date());
  const nonce = randomUUID().replace(/-/g, "");
  let response: Response;
  try {
    response = await fetch(`https://openapi.dnse.com.vn${path}${query}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Date: date,
        "X-Signature": signRequest(path, date, nonce, apiSecret),
        "x-api-key": apiKey,
        version: process.env.DNSE_API_VERSION || "2026-05-07",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("DNSE không phản hồi sau 10 giây. Máy chủ có thể đang ở ngoài Việt Nam hoặc bị DNSE chặn kết nối.");
    }
    throw new Error("Không kết nối được tới DNSE.");
  }

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("DNSE từ chối xác thực. Kiểm tra API Key, API Secret và đăng ký Lightspeed API.");
    throw new Error(`DNSE trả lỗi HTTP ${response.status}.`);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("DNSE trả dữ liệu không đúng định dạng JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numeric(value: unknown): number | null {
  if (value && typeof value === "object") {
    const record = asRecord(value);
    return record ? numeric(record.value ?? record.price) : null;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function extractLastTrade(payload: unknown) {
  const root = asRecord(payload);
  const data = root ? (root.data ?? root.result ?? payload) : payload;
  const record = asRecord(data);
  const trades = record?.trades;
  const trade = Array.isArray(data)
    ? data[0]
    : Array.isArray(trades)
      ? trades[0]
      : record?.trade ?? data;
  const fields = asRecord(trade);
  if (!fields) return null;

  const price = numeric(fields.price ?? fields.matchPrice ?? fields.match_price ?? fields.tradePrice ?? fields.lastPrice ?? fields.closePrice);
  if (!price) return null;
  return {
    price,
    timestamp: parseTimestamp(fields.time ?? fields.timestamp ?? fields.tradeTime ?? fields.trade_time ?? fields.matchTime ?? fields.match_time),
  };
}

export async function getDnseQuote(rawSymbol: string) {
  const symbol = rawSymbol.trim().toUpperCase();
  const path = `/price/${encodeURIComponent(symbol)}/trades/latest`;
  const payload = await getDnseJson(path, "?boardId=G1");
  const latest = extractLastTrade(payload);
  if (!latest) return null;
  // DNSE stock market data is quoted in thousands of VND; StockMate stores VND.
  return { symbol, ...latest, price: latest.price * 1000, source: "DNSE" as const } satisfies DnseQuote;
}

export type DnseAccountBalance = {
  accountNo: string;
  sections: Array<{ name: string; amounts: Array<{ field: string; value: number }> }>;
};

function unwrapData(payload: unknown): unknown {
  const root = asRecord(payload);
  return root ? (root.data ?? root.result ?? payload) : payload;
}

function extractAccounts(payload: unknown): Array<Record<string, unknown>> {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data.map(asRecord).filter((account): account is Record<string, unknown> => account !== null);
  const record = asRecord(data);
  const accounts = record?.accounts;
  return Array.isArray(accounts)
    ? accounts.map(asRecord).filter((account): account is Record<string, unknown> => account !== null)
    : [];
}

function extractBalanceSections(payload: unknown): DnseAccountBalance["sections"] {
  const data = unwrapData(payload);
  const root = asRecord(data);
  if (!root) return [];

  const sections: DnseAccountBalance["sections"] = [];
  const candidates = Object.entries(root).filter(([, value]) => asRecord(value) || Array.isArray(value));
  const entries = candidates.length ? candidates : [["account", root] as [string, Record<string, unknown>]];
  for (const [name, value] of entries) {
    const section = asRecord(value);
    const sectionRecords = section ? [section] : Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null) : [];
    if (!sectionRecords.length) continue;
    const amounts: Array<{ field: string; value: number }> = [];
    const visit = (record: Record<string, unknown>, prefix = "") => {
      for (const [field, child] of Object.entries(record)) {
        const key = prefix ? `${prefix}.${field}` : field;
        if (/account|currency|type|id|date|time|status/i.test(field)) continue;
        const isMoneyField = /cash|balance|secure|debt|asset|equity|withdraw|loan|buying|sell|remain|available|total|used/i.test(field)
          || (/cash|balance|secure|asset|equity|debt|money/i.test(prefix) && /amount|value|remain|available|used|total/i.test(field));
        if (isMoneyField && typeof child === "number" && Number.isFinite(child)) amounts.push({ field: key, value: child });
        else if (isMoneyField && typeof child === "string" && child.trim() && Number.isFinite(Number(child))) amounts.push({ field: key, value: Number(child) });
        else {
          const nested = asRecord(child);
          if (nested) visit(nested, key);
        }
      }
    };
    for (const sectionRecord of sectionRecords) visit(sectionRecord);
    if (amounts.length) sections.push({ name, amounts });
  }
  return sections;
}

/** Read-only account cash/balance data. No trading token or order permission is used. */
export async function getDnseAccountBalances(): Promise<DnseAccountBalance[]> {
  const accountPayload = await getDnseJson("/accounts");
  const accounts = extractAccounts(accountPayload);
  if (!accounts.length) throw new Error("DNSE không trả về tiểu khoản nào cho API Key này.");

  const requestedAccountNo = process.env.DNSE_ACCOUNT_NO?.trim();
  const eligibleAccounts = requestedAccountNo
    ? accounts.filter((account) => String(account.id ?? account.accountNo ?? account.accountNumber ?? "") === requestedAccountNo)
    : accounts;
  if (!eligibleAccounts.length) throw new Error("DNSE_ACCOUNT_NO không khớp với tiểu khoản nào trong tài khoản DNSE.");

  return Promise.all(eligibleAccounts.map(async (account) => {
    const accountNo = String(account.id ?? account.accountNo ?? account.accountNumber ?? "");
    if (!accountNo) throw new Error("DNSE trả tiểu khoản thiếu số tài khoản.");
    const balancePayload = await getDnseJson(`/accounts/${encodeURIComponent(accountNo)}/balances`);
    return { accountNo, sections: extractBalanceSections(balancePayload) };
  }));
}
