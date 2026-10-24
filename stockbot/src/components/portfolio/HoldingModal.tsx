"use client";

import { useState } from "react";
import type { Holding, Market } from "@/lib/types";
import { usePortfolio } from "./PortfolioProvider";

export type MarketFilter = Market | "Tất cả";

/**
 * Add/edit form state. The table's market filter doubles as the form's
 * exchange, so the filter lives here too.
 */
export function useHoldingForm() {
  const [market, setMarket] = useState<MarketFilter>("Tất cả");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState(100);
  const [averagePrice, setAveragePrice] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function openNew() {
    setMarket("HOSE");
    setTicker("");
    setAveragePrice(0);
    setShares(1);
    setEditingId(null);
    setShowAdd(true);
  }

  function openEdit(item: Holding) {
    setEditingId(item.id);
    setTicker(item.ticker);
    setShares(item.shares);
    setAveragePrice(item.price);
    setMarket(item.market);
    setShowAdd(true);
  }

  function reset() {
    setTicker("");
    setShares(100);
    setAveragePrice(0);
    setEditingId(null);
    setShowAdd(false);
  }

  return {
    market,
    setMarket,
    ticker,
    setTicker,
    shares,
    setShares,
    averagePrice,
    setAveragePrice,
    editingId,
    showAdd,
    setShowAdd,
    openNew,
    openEdit,
    reset,
  };
}

export type HoldingForm = ReturnType<typeof useHoldingForm>;

export function HoldingModal({ form }: { form: HoldingForm }) {
  const { saving, saveHolding } = usePortfolio();
  const { market, ticker, shares, averagePrice, editingId } = form;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol || averagePrice <= 0) return;
    const saved = await saveHolding(
      {
        ticker: symbol,
        exchange: market === "Tất cả" ? "HOSE" : market,
        quantity: shares,
        averagePrice,
      },
      editingId,
    );
    if (saved) form.reset();
  }

  if (!form.showAdd) return null;
  return (
    <div className="modal-backdrop" onClick={() => form.setShowAdd(false)}>
      <form
        className="add-modal"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={() => form.setShowAdd(false)}
        >
          ×
        </button>
        <span className="modal-icon">＋</span>
        <h2>{editingId ? "Cập nhật cổ phiếu" : "Thêm cổ phiếu"}</h2>
        <p>
          Nhập mã, số lượng và giá vốn để StockMate định giá theo thị trường.
        </p>
        <label htmlFor="ticker">Mã cổ phiếu</label>
        <input
          id="ticker"
          value={ticker}
          onChange={(e) => form.setTicker(e.target.value.toUpperCase())}
          placeholder={market === "US" ? "Ví dụ: AAPL" : "Ví dụ: FPT"}
          maxLength={12}
          required
          disabled={Boolean(editingId)}
        />
        <label htmlFor="exchange">Thị trường</label>
        <select
          id="exchange"
          value={market === "Tất cả" ? "HOSE" : market}
          onChange={(e) => form.setMarket(e.target.value as Market)}
        >
          <option value="HOSE">HOSE</option>
          <option value="HNX">HNX</option>
          <option value="UPCOM">UPCOM</option>
          <option value="US">Mỹ (Finnhub)</option>
        </select>
        <label htmlFor="shares">Số lượng cổ phiếu</label>
        <input
          id="shares"
          type="number"
          min="1"
          value={shares}
          onChange={(e) => form.setShares(Number(e.target.value))}
          required
        />
        <label htmlFor="average-price">
          Giá vốn trung bình ({market === "US" ? "USD" : "VND"})
        </label>
        <input
          id="average-price"
          type="number"
          min={market === "US" ? "0.01" : "1"}
          step={market === "US" ? "0.01" : "100"}
          value={averagePrice || ""}
          onChange={(e) => form.setAveragePrice(Number(e.target.value))}
          required
        />
        <button
          className="primary-button modal-submit"
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Đang lưu…"
            : editingId
              ? "Lưu thay đổi →"
              : "Thêm vào danh mục →"}
        </button>
      </form>
    </div>
  );
}
