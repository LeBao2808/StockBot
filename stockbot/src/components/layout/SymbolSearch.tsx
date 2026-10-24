"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

type Instrument = {
  symbol: string;
  name: string;
  exchange: "HOSE" | "HNX" | "UPCOM" | "INDEX";
  type: "STOCK" | "ETF" | "INDEX";
};

const MAX_RESULTS = 8;

/** Lowercase and strip Vietnamese diacritics so "ngan hang" matches "Ngân hàng". */
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// Shared across mounts: the list is ~1.5k rows and rarely changes.
let instrumentsRequest: Promise<Instrument[]> | null = null;
function loadInstruments() {
  instrumentsRequest ??= fetch("/api/market/symbols")
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được danh sách mã.");
      return (data.symbols as Instrument[]).map((item) => ({ ...item, folded: fold(item.name) }));
    })
    .catch((error: unknown) => {
      instrumentsRequest = null;
      throw error;
    });
  return instrumentsRequest;
}

function search(list: Array<Instrument & { folded?: string }>, query: string) {
  const symbolQuery = query.trim().toUpperCase();
  const nameQuery = fold(query.trim());
  if (!symbolQuery) return [];
  const ranked: Array<{ item: Instrument; rank: number }> = [];
  for (const item of list) {
    const rank =
      item.symbol === symbolQuery
        ? 0
        : item.symbol.startsWith(symbolQuery)
          ? 1
          : nameQuery.length >= 2 && item.folded?.includes(nameQuery)
            ? 2
            : item.symbol.includes(symbolQuery)
              ? 3
              : -1;
    if (rank >= 0) ranked.push({ item, rank });
  }
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        // Indices first among equal matches, so "vn" surfaces VNINDEX/VN30.
        Number(b.item.type === "INDEX") - Number(a.item.type === "INDEX") ||
        a.item.symbol.length - b.item.symbol.length ||
        a.item.symbol.localeCompare(b.item.symbol),
    )
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}

export function SymbolSearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [error, setError] = useState("");

  const results = useMemo(() => (instruments ? search(instruments, query) : []), [instruments, query]);
  const showList = open && query.trim().length > 0;

  function ensureLoaded() {
    if (instruments) return;
    loadInstruments()
      .then(setInstruments)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Không tải được danh sách mã."));
  }

  function go(symbol: string) {
    setQuery("");
    setOpen(false);
    router.push(`/stock/${symbol}`);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const picked = results[active];
    if (picked) return go(picked.symbol);
    // No list yet (or no match): still allow typing an exact code.
    const value = query.trim().toUpperCase();
    if (/^[A-Z0-9]{2,12}$/.test(value)) go(value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form className="symbol-search" onSubmit={submit} role="search">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Tra mã cổ phiếu
      </label>
      <input
        id={`${listId}-input`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Tra mã hoặc tên công ty"
        maxLength={40}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].symbol}` : undefined}
      />
      <button type="submit" aria-label="Xem biểu đồ">
        →
      </button>
      {showList && (
        <ul className="symbol-suggestions" id={listId} role="listbox">
          {results.map((item, index) => (
            <li
              key={item.symbol}
              id={`${listId}-${item.symbol}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              // mousedown fires before the input's blur closes the list
              onMouseDown={(event) => {
                event.preventDefault();
                go(item.symbol);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <strong>{item.symbol}</strong>
              <span className="symbol-name">{item.name}</span>
              <span className={`exchange-badge ${item.exchange.toLowerCase()}`}>
                {item.type === "ETF" ? "ETF" : item.exchange === "INDEX" ? "CHỈ SỐ" : item.exchange}
              </span>
            </li>
          ))}
          {!results.length && (
            <li className="symbol-empty" role="presentation">
              {error
                ? error
                : instruments
                  ? "Không tìm thấy mã phù hợp — Enter để mở đúng mã đã gõ"
                  : "Đang tải danh sách mã…"}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
