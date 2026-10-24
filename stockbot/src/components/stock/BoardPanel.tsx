"use client";

import { useEffect, useState } from "react";
import type { Board } from "@/lib/dnse-board";
import { useTradingInterval } from "@/lib/market-hours";

const price = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1000);
const quantity = (value: number | null) => (value === null ? "—" : new Intl.NumberFormat("vi-VN").format(value));
const compact = (value: number) =>
  new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const billions = (value: number | null) =>
  value === null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value / 1e9)} tỷ`;
const dayMonth = (dateKey: string) => dateKey.split("-").reverse().slice(0, 2).join("/");

/** Vietnamese board colours: ceiling purple, floor cyan, reference yellow, up green, down red. */
function tone(value: number | null, session: Board["session"]) {
  if (value === null || !session) return "";
  if (value >= session.ceiling) return "tone-ceiling";
  if (value <= session.floor) return "tone-floor";
  if (value === session.reference) return "tone-ref";
  return value > session.reference ? "tone-up" : "tone-down";
}

function useBoard(symbol: string) {
  const [state, setState] = useState<{ symbol: string; board: Board | null; error: string }>({
    symbol: "",
    board: null,
    error: "",
  });
  const [tick, setTick] = useState(0);
  useTradingInterval(() => setTick((value) => value + 1), 5_000);

  useEffect(() => {
    let active = true;
    fetch(`/api/market/board/${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được bảng giá.");
        if (active) setState({ symbol, board: data.board, error: "" });
      })
      .catch((error: unknown) => {
        // Keep the last good board on a failed refresh; only show the error if there is nothing yet.
        if (active)
          setState((current) =>
            current.symbol === symbol && current.board
              ? current
              : { symbol, board: null, error: error instanceof Error ? error.message : "Không kết nối được DNSE." },
          );
      });
    return () => {
      active = false;
    };
  }, [symbol, tick]);

  return { ...state, loading: state.symbol !== symbol };
}

/** Entrade X style "Bước giá" panel: session prices, top-3 order book, session stats, foreign flow. */
export function BoardPanel({ symbol }: { symbol: string }) {
  const { board, error, loading } = useBoard(symbol);

  if (loading || !board) {
    return (
      <aside className="panel board-panel" aria-label={`Bước giá ${symbol}`}>
        <p className={error ? "us-quote-error" : "muted"} role={error ? "alert" : undefined}>
          {error || `Đang tải bảng giá ${symbol}…`}
        </p>
      </aside>
    );
  }

  const { session } = board;
  const depth = Math.max(board.bids.length, board.asks.length, 3);
  const totalDepth = board.totalBid + board.totalAsk;
  const bidShare = totalDepth ? (board.totalBid / totalDepth) * 100 : 50;
  const maxLevel = Math.max(1, ...board.bids.map((level) => level.quantity), ...board.asks.map((level) => level.quantity));
  const up = (board.change ?? 0) > 0;
  const down = (board.change ?? 0) < 0;

  return (
    <aside className="panel board-panel" aria-label={`Bước giá ${symbol}`}>
      <div className="board-head">
        <div className="board-title">
          <strong>{board.symbol}</strong>
          <span className={`board-price ${tone(board.price, session)}`}>{price(board.price)}</span>
          {board.change !== null && board.changePercent !== null && (
            <span className={`board-change ${tone(board.price, session)}`}>
              {up ? "▲" : down ? "▼" : "■"} {price(Math.abs(board.change))} ({up ? "+" : down ? "−" : ""}
              {Math.abs(board.changePercent).toFixed(2).replace(".", ",")}%)
            </span>
          )}
        </div>
        <p className="board-name">
          {board.exchange ?? "—"} · {board.name || "—"}
        </p>
      </div>

      {board.nextSession && (
        <div className="board-next">
          <span>Thông tin phiên GD tiếp theo {dayMonth(board.nextSession.date)}</span>
          <div className="board-trio">
            <span>
              Sàn <b className="tone-floor">{price(board.nextSession.floor)}</b>
            </span>
            <span>
              TC <b className="tone-ref">{price(board.nextSession.reference)}</b>
            </span>
            <span>
              Trần <b className="tone-ceiling">{price(board.nextSession.ceiling)}</b>
            </span>
          </div>
        </div>
      )}

      <table className="board-depth">
        <thead>
          <tr>
            <th>KL mua</th>
            <th className="align-right">Giá mua</th>
            <th>Giá bán</th>
            <th className="align-right">KL bán</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: depth }, (_, index) => {
            const bid = board.bids[index];
            const ask = board.asks[index];
            return (
              <tr key={index}>
                <td>{bid ? quantity(bid.quantity) : ""}</td>
                <td className={`align-right depth-cell bid ${tone(bid?.price ?? null, session)}`}>
                  {bid && <i style={{ width: `${(bid.quantity / maxLevel) * 100}%` }} />}
                  <span>{bid ? price(bid.price) : ""}</span>
                </td>
                <td className={`depth-cell ask ${tone(ask?.price ?? null, session)}`}>
                  {ask && <i style={{ width: `${(ask.quantity / maxLevel) * 100}%` }} />}
                  <span>{ask ? price(ask.price) : ""}</span>
                </td>
                <td className="align-right">{ask ? quantity(ask.quantity) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="board-balance" aria-hidden>
        <i style={{ width: `${bidShare}%` }} />
      </div>
      <div className="board-balance-labels">
        <span>
          Dư mua: <b>{compact(board.totalBid)}</b>
        </span>
        <span>
          Dư bán: <b>{compact(board.totalAsk)}</b>
        </span>
      </div>

      <dl className="board-grid">
        <div>
          <dt>Sàn</dt>
          <dd className="tone-floor">{price(session?.floor ?? null)}</dd>
        </div>
        <div>
          <dt>TC{session?.estimated ? "*" : ""}</dt>
          <dd className="tone-ref">{price(session?.reference ?? null)}</dd>
        </div>
        <div>
          <dt>Trần</dt>
          <dd className="tone-ceiling">{price(session?.ceiling ?? null)}</dd>
        </div>
        <div>
          <dt>Thấp</dt>
          <dd className={tone(board.low, session)}>{price(board.low)}</dd>
        </div>
        <div>
          <dt>TB</dt>
          <dd className={tone(board.average, session)}>{price(board.average)}</dd>
        </div>
        <div>
          <dt>Cao</dt>
          <dd className={tone(board.high, session)}>{price(board.high)}</dd>
        </div>
      </dl>

      <dl className="board-stats">
        <div>
          <dt>KL khớp</dt>
          <dd>{quantity(board.volume)}</dd>
        </div>
        <div>
          <dt>GT khớp</dt>
          <dd>{billions(board.value)}</dd>
        </div>
        <div>
          <dt>NN mua</dt>
          <dd>{quantity(board.foreign?.buyVolume ?? null)}</dd>
        </div>
        <div>
          <dt>NN bán</dt>
          <dd>{quantity(board.foreign?.sellVolume ?? null)}</dd>
        </div>
        <div className="wide">
          <dt>Room NN</dt>
          <dd>{quantity(board.foreign?.room ?? null)}</dd>
        </div>
      </dl>
      <p className="board-foot">
        Giá: nghìn đồng · KL: cổ phiếu · DNSE
        {session?.estimated && " · *TC ước tính từ giá đóng cửa"}
      </p>
    </aside>
  );
}
