"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

type Market = "HOSE" | "HNX" | "UPCOM" | "US";
type Holding = {
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
type PortfolioComparison = {
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
type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  comparison?: PortfolioComparison;
  streaming?: boolean;
};

/** Reveals assistant replies progressively so data appears to stream into the chat. */
function TypewriterText({
  text,
  onTick,
  onDone,
}: {
  text: string;
  onTick: () => void;
  onDone: () => void;
}) {
  const [count, setCount] = useState(0);
  const tick = useEffectEvent(onTick);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => {
        setCount(text.length);
        done();
      });
      return () => cancelAnimationFrame(frame);
    }
    // Finish long answers in roughly 1.5s, short ones at a natural pace.
    const step = Math.max(1, Math.ceil(text.length / 90));
    let shown = 0;
    let frame = 0;
    const advance = () => {
      shown = Math.min(text.length, shown + step);
      setCount(shown);
      tick();
      if (shown < text.length) frame = requestAnimationFrame(advance);
      else done();
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <>
      {text.slice(0, count)}
      {count < text.length && <span className="type-caret" aria-hidden />}
    </>
  );
}
type UsQuote = {
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
type AppSection = "overview" | "portfolio" | "markets" | "performance";

const sectionLabels: Record<AppSection, string> = {
  overview: "Tổng quan",
  portfolio: "Danh mục",
  markets: "Thị trường",
  performance: "Hiệu suất",
};

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " ₫";
const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

export default function Home() {
  const [capital, setCapital] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [market, setMarket] = useState<Market | "Tất cả">("Tất cả");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState(100);
  const [averagePrice, setAveragePrice] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  function scrollChatToBottom(smooth = false) {
    const body = chatBodyRef.current;
    if (body)
      body.scrollTo({
        top: body.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
  }

  function finishStreaming(index: number) {
    setChatMessages((messages) =>
      messages.map((message, i) =>
        i === index ? { ...message, streaming: false } : message,
      ),
    );
    requestAnimationFrame(() => scrollChatToBottom(true));
  }

  useEffect(() => {
    scrollChatToBottom(true);
  }, [chatMessages.length, chatBusy, chatOpen]);
  const [usSymbol, setUsSymbol] = useState("");
  const [usQuote, setUsQuote] = useState<UsQuote | null>(null);
  const [usQuoteError, setUsQuoteError] = useState("");
  const [usQuoteBusy, setUsQuoteBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  const invested = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "VND")
        .reduce((sum, item) => sum + item.shares * item.price, 0),
    [holdings],
  );
  const investedUsd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "USD")
        .reduce((sum, item) => sum + item.shares * item.price, 0),
    [holdings],
  );
  const marketValueVnd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "VND")
        .reduce(
          (sum, item) => sum + item.shares * (item.currentPrice ?? item.price),
          0,
        ),
    [holdings],
  );
  const marketValueUsd = useMemo(
    () =>
      holdings
        .filter((item) => item.currency === "USD")
        .reduce(
          (sum, item) => sum + item.shares * (item.currentPrice ?? item.price),
          0,
        ),
    [holdings],
  );
  const pnlVnd = marketValueVnd - invested;
  const pnlUsd = marketValueUsd - investedUsd;
  const pnlVndPercent = invested ? (pnlVnd / invested) * 100 : 0;
  const pnlUsdPercent = investedUsd ? (pnlUsd / investedUsd) * 100 : 0;
  const visibleHoldings =
    market === "Tất cả"
      ? holdings
      : holdings.filter((item) => item.market === market);
  const cash = Math.max(capital - invested, 0);

  useEffect(() => {
    if (!chatOpen || !chatFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [chatOpen, chatFullscreen]);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Không tải được danh mục.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setCapital(data.portfolio.capital);
        setHoldings(
          data.holdings.map(
            (item: {
              id: string;
              ticker: string;
              name: string;
              exchange: Market;
              currency: "VND" | "USD";
              quantity: number;
              averagePrice: number;
            }) => ({
              id: item.id,
              ticker: item.ticker,
              name: item.name,
              market: item.exchange,
              currency:
                item.currency ?? (item.exchange === "US" ? "USD" : "VND"),
              shares: item.quantity,
              price: item.averagePrice,
              currentPrice: null,
              change: null,
            }),
          ),
        );
      })
      .catch((error: unknown) => {
        if (active)
          setApiError(
            error instanceof Error ? error.message : "Không kết nối được API.",
          );
      })
      .finally(() => {
        if (active) setLoadingPortfolio(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const pending = holdings.filter((item) => item.currentPrice === null);
    if (!pending.length) return;
    let active = true;
    setRefreshingPrices(true);
    Promise.all(
      pending.map(async (item) => {
        try {
          const path =
            item.market === "US"
              ? `/api/market/us/${encodeURIComponent(item.ticker)}`
              : `/api/market/quote/${encodeURIComponent(item.ticker)}`;
          const response = await fetch(path, { cache: "no-store" });
          if (!response.ok) return null;
          const data = await response.json();
          const price = Number(data.quote?.price);
          return Number.isFinite(price) && price > 0
            ? { id: item.id, price }
            : null;
        } catch {
          return null;
        }
      }),
    )
      .then((quotes) => {
        if (!active) return;
        const available = new Map(
          quotes
            .filter(
              (quote): quote is { id: string; price: number } => quote !== null,
            )
            .map((quote) => [quote.id, quote.price]),
        );
        if (available.size)
          setHoldings((items) =>
            items.map((item) =>
              available.has(item.id)
                ? { ...item, currentPrice: available.get(item.id)! }
                : item,
            ),
          );
      })
      .finally(() => {
        if (active) setRefreshingPrices(false);
      });
    return () => {
      active = false;
    };
  }, [holdings]);

  async function askAssistant(question = chatInput) {
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    const history = chatMessages
      .slice(-8)
      .map(({ role, text }) => ({ role, content: text }));
    setChatMessages((messages) => [
      ...messages,
      { role: "user", text: prompt },
    ]);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, history }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Trợ lý chưa lấy được dữ liệu.");
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text: data.answer,
          comparison: data.comparison,
          streaming: true,
        },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Chưa gọi được API trợ lý.",
          streaming: true,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function addHolding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol || averagePrice <= 0) return;
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch(
        editingId ? `/api/holdings/${editingId}` : "/api/holdings",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: symbol,
            exchange: market === "Tất cả" ? "HOSE" : market,
            quantity: shares,
            averagePrice,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không lưu được cổ phiếu.");
      const item = data.holding;
      const saved: Holding = {
        id: item.id,
        ticker: item.ticker,
        name: item.name,
        market: item.exchange,
        currency: item.currency ?? (item.exchange === "US" ? "USD" : "VND"),
        shares: item.quantity,
        price: item.averagePrice,
        currentPrice: null,
        change: null,
      };
      if (editingId)
        setHoldings((items) =>
          items.map((holding) => (holding.id === editingId ? saved : holding)),
        );
      else setHoldings((items) => [...items, saved]);
      setTicker("");
      setShares(100);
      setAveragePrice(0);
      setEditingId(null);
      setShowAdd(false);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không lưu được cổ phiếu.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCapital() {
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được vốn.");
      setCapital(data.portfolio.capital);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không lưu được vốn.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteHolding(id: string) {
    setApiError("");
    try {
      const response = await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không xóa được cổ phiếu.");
      setHoldings((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Không xóa được cổ phiếu.",
      );
    }
  }

  async function lookupUsStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = usSymbol.trim().toUpperCase();
    if (!symbol || usQuoteBusy) return;
    setUsQuoteBusy(true);
    setUsQuoteError("");
    setUsQuote(null);
    try {
      const response = await fetch(
        `/api/market/us/${encodeURIComponent(symbol)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không tra cứu được mã cổ phiếu.");
      setUsQuote(data.quote);
    } catch (error) {
      setUsQuoteError(
        error instanceof Error ? error.message : "Không kết nối được Finnhub.",
      );
    } finally {
      setUsQuoteBusy(false);
    }
  }

  function refreshHoldingPrices() {
    setHoldings((items) =>
      items.map((item) => ({ ...item, currentPrice: null })),
    );
  }

  function editHolding(item: Holding) {
    setEditingId(item.id);
    setTicker(item.ticker);
    setShares(item.shares);
    setAveragePrice(item.price);
    setMarket(item.market);
    setShowAdd(true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">S</span>
          <span>
            stock<span className="brand-light">mate</span>
            <small>ĐẦU TƯ CÓ KẾ HOẠCH</small>
          </span>
        </a>
        <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
        <nav className="nav-list" aria-label="Điều hướng chính">
          {(
            ["overview", "portfolio", "markets", "performance"] as AppSection[]
          ).map((section) => (
            <button
              key={section}
              type="button"
              className={`nav-item ${activeSection === section ? "active" : ""}`}
              onClick={() => setActiveSection(section)}
            >
              <span>
                {section === "overview"
                  ? "▦"
                  : section === "portfolio"
                    ? "◫"
                    : section === "markets"
                      ? "⌁"
                      : "↗"}
              </span>{" "}
              {sectionLabels[section]}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✳</span>
            <strong>Bắt đầu thật vững</strong>
            <p>Ghi lại vốn và danh mục để theo dõi tài sản của bạn.</p>
            <button type="button" onClick={() => setActiveSection("portfolio")}>
              Thiết lập danh mục <span>↗</span>
            </button>
          </div>
          <div className="profile">
            <div className="avatar">B</div>
            <div>
              <strong>Bảo Lê</strong>
              <small>Tài khoản cá nhân</small>
            </div>
            <span className="profile-dots">···</span>
          </div>
        </div>
      </aside>

      <section className="main-area" id="portfolio">
        <header className="topbar">
          <div className="breadcrumb">
            Không gian đầu tư <span>/</span>{" "}
            <strong>{sectionLabels[activeSection]}</strong>
          </div>
          <div className="top-actions">
            <span className="market-status">
              <i /> Thị trường đang mở
            </span>
            <button className="icon-button" aria-label="Thông báo">
              ♧<b />
            </button>
            <div className="top-avatar">B</div>
          </div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="sparkle">✳</span> KHÔNG GIAN ĐẦU TƯ
              </div>
              <h1>
                {activeSection === "overview" ? (
                  <>
                    Chào buổi sáng, Bảo <span>✳</span>
                  </>
                ) : (
                  sectionLabels[activeSection]
                )}
              </h1>
              <p>
                {activeSection === "overview"
                  ? "Đây là bức tranh tổng quan về khoản đầu tư của bạn."
                  : activeSection === "portfolio"
                    ? "Quản lý vốn và các mã cổ phiếu bạn đang nắm giữ."
                    : activeSection === "markets"
                      ? "Tra cứu giá cổ phiếu quốc tế bằng Finnhub."
                      : "Theo dõi lãi/lỗ và hiệu suất danh mục theo thời gian."}
              </p>
            </div>
            {activeSection === "portfolio" && (
              <button
                className="primary-button"
                onClick={() => setShowAdd(true)}
              >
                <span>＋</span> Thêm cổ phiếu
              </button>
            )}
          </section>
          {apiError && (
            <div className="api-alert" role="alert">
              <span>!</span>
              {apiError}
            </div>
          )}

          {activeSection === "performance" && (
            <>
              <section className="panel pnl-panel">
                <div className="pnl-heading">
                  <div>
                    <h2>Tổng hợp lãi/lỗ</h2>
                    <p>
                      Giá trị ước tính theo giá DNSE/Finnhub tải gần nhất; USD và
                      VND được giữ riêng.
                    </p>
                  </div>
                </div>
                <div className="pnl-grid">
                  <article className="pnl-card pnl-main">
                    <span>TÀI SẢN ƯỚC TÍNH · VND</span>
                    <strong>
                      {new Intl.NumberFormat("vi-VN").format(
                        cash + marketValueVnd,
                      )}{" "}
                      <small>₫</small>
                    </strong>
                    <p>Tiền mặt VND + cổ phiếu Việt Nam</p>
                  </article>
                  <article className="pnl-card">
                    <span>CỔ PHIẾU · USD</span>
                    <strong>
                      {dollars(marketValueUsd)} <small>USD</small>
                    </strong>
                    <p>Không quy đổi sang VND</p>
                  </article>
                  <article className="pnl-card">
                    <span>LỜI/LỖ CỔ PHIẾU · VND</span>
                    <strong className={pnlVnd >= 0 ? "profit" : "loss"}>
                      {pnlVnd >= 0 ? "+" : "−"}
                      {money(Math.abs(pnlVnd))}
                    </strong>
                    <p className={pnlVnd >= 0 ? "profit" : "loss-text"}>
                      {pnlVndPercent.toFixed(2)}%
                    </p>
                  </article>
                  <article className="pnl-card">
                    <span>LỜI/LỖ CỔ PHIẾU · USD</span>
                    <strong className={pnlUsd >= 0 ? "profit" : "loss"}>
                      {pnlUsd >= 0 ? "+" : "−"}
                      {dollars(Math.abs(pnlUsd))}
                    </strong>
                    <p className={pnlUsd >= 0 ? "profit" : "loss-text"}>
                      {pnlUsdPercent.toFixed(2)}%
                    </p>
                  </article>
                </div>
                <div className="pnl-actions">
                  <button
                    className="primary-button"
                    onClick={refreshHoldingPrices}
                    disabled={refreshingPrices}
                  >
                    {refreshingPrices
                      ? "Đang cập nhật giá…"
                      : "Cập nhật giá mới nhất"}
                  </button>
                </div>
              </section>

              <section className="panel yearly-panel">
                <div className="yearly-heading">
                  <div>
                    <h2>
                      Hiệu suất theo năm &amp; lũy kế <span>(all-time)</span>
                    </h2>
                    <p>
                      Bảng minh họa giao diện; số liệu lịch sử chưa được tính từ
                      giao dịch đã lưu.
                    </p>
                  </div>
                  <span className="demo-badge">DỮ LIỆU MẪU</span>
                </div>
                <div className="yearly-scroll">
                  <table className="yearly-table">
                    <thead>
                      <tr>
                        <th>NĂM</th>
                        <th>VỐN TÍCH LŨY</th>
                        <th>GIÁ TRỊ HIỆN TẠI</th>
                        <th>LỜI/LỖ TRONG NĂM</th>
                        <th>LỜI/LỖ LŨY KẾ (ALL-TIME)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>2024</td>
                        <td>
                          7.670.000 VND
                          <br />
                          <span>295,00 USD</span>
                        </td>
                        <td>
                          11.900.000 VND
                          <br />
                          <span>476,00 USD</span>
                        </td>
                        <td className="profit">
                          4.230.000 VND (55,15%)
                          <br />
                          <span>181,00 USD (61,36%)</span>
                        </td>
                        <td className="profit">0 VND (0,00%)</td>
                      </tr>
                      <tr>
                        <td>2025</td>
                        <td>
                          26.506.000 VND
                          <br />
                          <span>1.043,96 USD</span>
                        </td>
                        <td>
                          30.458.792 VND
                          <br />
                          <span>1.132,09 USD</span>
                        </td>
                        <td className="loss-text">
                          −277.208 VND (−0,90%)
                          <br />
                          <span>−92,87 USD (−7,58%)</span>
                        </td>
                        <td className="profit">3.952.792 VND (14,91%)</td>
                      </tr>
                      <tr className="current-year">
                        <td>2026</td>
                        <td>
                          26.506.000 VND
                          <br />
                          <span>1.043,96 USD</span>
                        </td>
                        <td>
                          22.601.645 VND
                          <br />
                          <span>871,44 USD</span>
                        </td>
                        <td className="loss-text">
                          −3.904.355 VND (−14,73%)
                          <br />
                          <span>−172,52 USD (−16,53%)</span>
                        </td>
                        <td className="loss-text">−3.904.355 VND (−14,73%)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {activeSection === "overview" && (
            <section className="summary-grid" id="capital">
              <article className="summary-card total-card">
                <div className="card-label">TÀI SẢN ƯỚC TÍNH · VND</div>
                <div className="total-number">
                  {money(cash + marketValueVnd)}
                </div>
                <div className="total-foot">
                  <span className="muted">
                    Tiền mặt + cổ phiếu Việt Nam theo giá mới nhất
                  </span>
                </div>
              </article>
              <article className="summary-card">
                <div className="card-label">CỔ PHIẾU VIỆT NAM</div>
                <div className="metric-number">{money(marketValueVnd)}</div>
                <div className="allocation-caption">
                  <span>
                    {holdings.filter((item) => item.currency === "VND").length}{" "}
                    mã · {Math.round((invested / Math.max(capital, 1)) * 100)}%
                    vốn gốc
                  </span>
                </div>
                <div className="card-icon violet">◈</div>
              </article>
              <article className="summary-card">
                <div className="card-label">
                  TIỀN MẶT CÒN LẠI <button aria-label="Thông tin">ⓘ</button>
                </div>
                <div className="metric-number">{money(cash)}</div>
                <div className="cash-caption">
                  <span className="cash-dot" /> Sẵn sàng đầu tư
                </div>
                <div className="card-icon green">↗</div>
              </article>
              <article className="summary-card">
                <div className="card-label">CỔ PHIẾU MỸ · USD</div>
                <div className="metric-number">{dollars(marketValueUsd)}</div>
                <div className="allocation-caption">
                  <span>
                    {holdings.filter((item) => item.currency === "USD").length}{" "}
                    mã · tách riêng khỏi VND
                  </span>
                </div>
              </article>
            </section>
          )}

          {activeSection === "portfolio" && (
            <>
              <section className="summary-grid portfolio-summary">
                <article className="summary-card">
                  <div className="card-label">TÀI SẢN VND ƯỚC TÍNH</div>
                  <div className="metric-number">
                    {money(cash + marketValueVnd)}
                  </div>
                  <div className="total-foot">
                    <span className="muted">Tiền mặt + giá trị cổ phiếu</span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="card-label">
                    CỔ PHIẾU VND · THEO GIÁ HIỆN TẠI
                  </div>
                  <div className="metric-number">{money(marketValueVnd)}</div>
                  <div className="allocation-caption">
                    <span>Giá vốn {money(invested)}</span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="card-label">
                    CỔ PHIẾU MỸ · THEO GIÁ HIỆN TẠI
                  </div>
                  <div className="metric-number">{dollars(marketValueUsd)}</div>
                  <div className="allocation-caption">
                    <span>Giá vốn {dollars(investedUsd)}</span>
                  </div>
                </article>
                <article className="summary-card">
                  <div className="card-label">TIỀN MẶT VND CÒN LẠI</div>
                  <div className="metric-number">{money(cash)}</div>
                  <div className="cash-caption">
                    <span className="cash-dot" /> Chưa tính tiền mặt USD
                  </div>
                </article>
              </section>
              
              <section className="portfolio-allocation">
                <article className="panel market-panel" id="markets">
                  <div className="panel-heading">
                    <div>
                      <h2>Phân bổ theo sàn</h2>
                      <p>Giá trị danh mục của bạn</p>
                    </div>
                    <button className="more-button" aria-label="Tùy chọn">
                      ···
                    </button>
                  </div>
                  <div className="market-content">
                    <div className="donut-wrap">
                      <div className="donut">
                        <div>
                          <strong>{holdings.length}</strong>
                          <small>MÃ CP</small>
                        </div>
                      </div>
                    </div>
                    <div className="market-legend">
                      {(["HOSE", "HNX", "UPCOM"] as Market[]).map(
                        (exchange) => {
                          const value = holdings
                            .filter((h) => h.market === exchange)
                            .reduce((sum, h) => sum + h.shares * h.price, 0);
                          const pct = invested
                            ? Math.round((value / invested) * 100)
                            : 0;
                          return (
                            <div className="legend-row" key={exchange}>
                              <span
                                className={`legend-dot ${exchange.toLowerCase()}`}
                              />
                              <span>{exchange}</span>
                              <strong>{pct}%</strong>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                  <div className="market-foot">
                    <span>⌁</span> Phân bổ danh mục theo từng sàn giao dịch
                  </div>
                </article>
              </section>
            </>
          )}
          {activeSection === "markets" && (
            <section
              className="panel us-market-panel"
              aria-labelledby="us-market-title"
            >
              <div className="us-market-heading">
                <div>
                  <span className="us-market-eyebrow">THỊ TRƯỜNG QUỐC TẾ</span>
                  <h2 id="us-market-title">Tra cứu cổ phiếu Mỹ</h2>
                  <p>
                    Nhập mã niêm yết như AAPL, MSFT hoặc NVDA để xem báo giá
                    bằng USD.
                  </p>
                </div>
                <span className="finnhub-mark">US</span>
              </div>
              <form className="us-lookup-form" onSubmit={lookupUsStock}>
                <label className="sr-only" htmlFor="us-symbol">
                  Mã cổ phiếu Mỹ
                </label>
                <input
                  id="us-symbol"
                  value={usSymbol}
                  onChange={(event) =>
                    setUsSymbol(event.target.value.toUpperCase())
                  }
                  placeholder="Nhập mã, ví dụ AAPL"
                  maxLength={10}
                  required
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={usQuoteBusy}
                >
                  {usQuoteBusy ? "Đang tra cứu…" : "Tra cứu giá →"}
                </button>
              </form>
              {usQuoteError && (
                <p className="us-quote-error" role="alert">
                  {usQuoteError}
                </p>
              )}
              {usQuote && (
                <div className="us-quote-card">
                  <div className="us-quote-main">
                    <span>{usQuote.symbol} · USD · Finnhub</span>
                    <strong>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(usQuote.price)}
                    </strong>
                    <small
                      className={
                        usQuote.change >= 0
                          ? "quote-positive"
                          : "quote-negative"
                      }
                    >
                      {usQuote.change >= 0 ? "+" : ""}
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(usQuote.change)}{" "}
                      ({usQuote.changePercent >= 0 ? "+" : ""}
                      {usQuote.changePercent.toFixed(2)}%) so với giá đóng cửa
                      trước
                    </small>
                  </div>
                  <div className="us-quote-stats">
                    <span>
                      Cao nhất hôm nay{" "}
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(usQuote.high)}
                      </strong>
                    </span>
                    <span>
                      Thấp nhất hôm nay{" "}
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(usQuote.low)}
                      </strong>
                    </span>
                    <span>
                      Mở cửa{" "}
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(usQuote.open)}
                      </strong>
                    </span>
                    <span>
                      Đóng cửa trước{" "}
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(usQuote.previousClose)}
                      </strong>
                    </span>
                  </div>
                  <small className="us-quote-time">
                    {usQuote.timestamp
                      ? `Thời điểm Finnhub: ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(usQuote.timestamp))} (giờ New York)`
                      : "Finnhub chưa trả timestamp cho báo giá này."}
                  </small>
                </div>
              )}
              <div className="us-market-foot">
                Giá tùy thuộc quyền truy cập và độ trễ của gói Finnhub. API key
                được giữ ở máy chủ.
              </div>
            </section>
          )}

          {activeSection === "portfolio" && (
            <section className="panel holdings-panel" id="holdings">
              <div className="holdings-heading">
                <div>
                  <h2>Cổ phiếu của bạn</h2>
                  <p>
                    Giá thị trường được tải tự động; VND và USD hiển thị riêng
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setMarket("HOSE");
                    setTicker("");
                    setAveragePrice(0);
                    setShares(1);
                    setEditingId(null);
                    setShowAdd(true);
                  }}
                >
                  ＋ Thêm mã mới
                </button>
              </div>
              <div className="table-toolbar">
                <div className="tabs">
                  {(["Tất cả", "HOSE", "HNX", "UPCOM", "US"] as const).map(
                    (item) => (
                      <button
                        key={item}
                        className={market === item ? "tab active-tab" : "tab"}
                        onClick={() => setMarket(item)}
                      >
                        {item}
                        {item === "Tất cả" && <span>{holdings.length}</span>}
                      </button>
                    ),
                  )}
                </div>
                <button
                  className="filter-button"
                  onClick={refreshHoldingPrices}
                  disabled={refreshingPrices}
                >
                  {refreshingPrices ? "Đang tải giá…" : "↻ Cập nhật giá"}
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>MÃ CỔ PHIẾU</th>
                      <th>SÀN</th>
                      <th className="align-right">SỐ LƯỢNG</th>
                      <th className="align-right">GIÁ VỐN TB</th>
                      <th className="align-right">GIÁ HIỆN TẠI</th>
                      <th className="align-right">GIÁ TRỊ HIỆN TẠI</th>
                      <th className="align-right">LÃI/LỖ TẠM TÍNH</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHoldings.length ? (
                      visibleHoldings.map((item) => {
                        const current = item.currentPrice ?? item.price;
                        const pnl = (current - item.price) * item.shares;
                        const pnlPercent = item.price > 0 ? ((current - item.price) / item.price) * 100 : 0;
                        const format =
                          item.currency === "USD" ? dollars : money;
                        return (
                          <tr key={item.id}>
                            <td>
                              <div className="stock-name">
                                <span
                                  className={`stock-logo logo-${item.ticker.toLowerCase()}`}
                                >
                                  {item.ticker.slice(0, 1)}
                                </span>
                                <div>
                                  <strong>{item.ticker}</strong>
                                  <small>{item.name}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`exchange-badge ${item.market.toLowerCase()}`}
                              >
                                {item.market}
                              </span>
                            </td>
                            <td className="align-right">
                              {new Intl.NumberFormat("vi-VN").format(
                                item.shares,
                              )}
                            </td>
                            <td className="align-right">
                              {format(item.price)}
                            </td>
                            <td className="align-right">
                              {item.currentPrice === null ? (
                                <span className="muted">Đang tải…</span>
                              ) : (
                                format(current)
                              )}
                            </td>
                            <td className="align-right value-cell">
                              {format(current * item.shares)}
                            </td>
                            <td className="align-right">
                              {item.currentPrice === null ? (
                                <span className="pnl-badge pnl-pending">Đang cập nhật</span>
                              ) : (
                                <span className={`pnl-badge ${pnl >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                                  <strong>{pnl >= 0 ? "+" : "−"}{format(Math.abs(pnl))}</strong>
                                  <small>{pnl >= 0 ? "▲" : "▼"} {Math.abs(pnlPercent).toFixed(2).replace(".", ",")}%</small>
                                </span>
                              )}
                            </td>
                            <td className="actions-cell">
                              <button
                                className="row-menu edit-action"
                                aria-label={`Sửa ${item.ticker}`}
                                title={`Sửa ${item.ticker}`}
                                onClick={() => editHolding(item)}
                              >
                                <span aria-hidden="true">✎</span><span className="action-label">Sửa</span>
                              </button>
                              <button
                                className="row-menu delete-menu"
                                aria-label={`Xóa ${item.ticker}`}
                                title={`Xóa ${item.ticker}`}
                                onClick={() => deleteHolding(item.id)}
                              >
                                <span aria-hidden="true">×</span><span className="action-label">Xóa</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="empty-state" colSpan={8}>
                          {loadingPortfolio
                            ? "Đang tải danh mục…"
                            : "Chưa có mã cổ phiếu trên sàn này."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>
                  Đang hiển thị <strong>{visibleHoldings.length}</strong> /{" "}
                  {holdings.length} mã
                </span>
                <button
                  onClick={() => {
                    setMarket("HOSE");
                    setTicker("");
                    setAveragePrice(0);
                    setShares(1);
                    setEditingId(null);
                    setShowAdd(true);
                  }}
                >
                  Thêm mã <span>＋</span>
                </button>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>© 2026 Stockmate</span>
            <span>
              Giá được tải từ nguồn thị trường khi mở danh mục <i /> VND và USD
              tách riêng
            </span>
          </footer>
        </div>
      </section>
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <form
            className="add-modal"
            onSubmit={addHolding}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowAdd(false)}
            >
              ×
            </button>
            <span className="modal-icon">＋</span>
            <h2>{editingId ? "Cập nhật cổ phiếu" : "Thêm cổ phiếu"}</h2>
            <p>
              Nhập mã, số lượng và giá vốn để StockMate định giá theo thị
              trường.
            </p>
            <label htmlFor="ticker">Mã cổ phiếu</label>
            <input
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder={market === "US" ? "Ví dụ: AAPL" : "Ví dụ: FPT"}
              maxLength={12}
              required
              disabled={Boolean(editingId)}
            />
            <label htmlFor="exchange">Thị trường</label>
            <select
              id="exchange"
              value={market === "Tất cả" ? "HOSE" : market}
              onChange={(e) => setMarket(e.target.value as Market)}
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
              onChange={(e) => setShares(Number(e.target.value))}
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
              onChange={(e) => setAveragePrice(Number(e.target.value))}
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
      )}
      {chatOpen && (
        <section
          className={`chat-panel ${chatFullscreen ? "chat-panel-fullscreen" : ""}`}
          aria-label="Trợ lý Stockmate"
        >
          <header className="chat-header">
            <div className="chat-brand">
              <span className="chat-avatar">✳</span>
              <div>
                <strong>Trợ lý Stockmate</strong>
                <small>
                  <i /> Sẵn sàng hỗ trợ
                </small>
              </div>
            </div>
            <div className="chat-actions">
              <button
                className="chat-expand"
                onClick={() => setChatFullscreen((full) => !full)}
                aria-label={chatFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
                title={chatFullscreen ? "Thu nhỏ (Esc)" : "Toàn màn hình"}
              >
                {chatFullscreen ? "⤡" : "⤢"}
              </button>
              <button
                className="chat-close"
                onClick={() => {
                  setChatOpen(false);
                  setChatFullscreen(false);
                }}
                aria-label="Đóng chat"
              >
                ×
              </button>
            </div>
          </header>
          <div className="chat-scope">
            <span>◫</span> Đang xem danh mục của bạn{" "}
            <span className="scope-chevron">⌄</span>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            <div className="chat-welcome">
              <span className="chat-welcome-icon">✳</span>
              <h3>Xin chào, Bảo!</h3>
              <p>Mình có thể giúp bạn hiểu rõ hơn về danh mục đầu tư.</p>
            </div>
            <div className="chat-questions">
              <span className="suggestion-label">THỬ HỎI</span>
              <button
                onClick={() => askAssistant("Mã nào đang lãi nhiều nhất?")}
              >
                Mã nào đang lãi nhiều nhất? <span>↗</span>
              </button>
              <button
                onClick={() => askAssistant("Tóm tắt danh mục của tôi hôm nay")}
              >
                Tóm tắt danh mục hôm nay <span>↗</span>
              </button>
              <button
                onClick={() =>
                  askAssistant(
                    "Tính giá trị hiện tại và lãi/lỗ của danh mục AAPL giúp tôi.",
                  )
                }
              >
                So sánh giá mua và hiện tại AAPL <span>↗</span>
              </button>
            </div>
            {chatMessages.map((message, index) => (
              <div
                className={`chat-message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                <span className="message-avatar">
                  {message.role === "assistant" ? "✳" : "B"}
                </span>
                <div className="chat-message-content">
                  <p>
                    {message.streaming ? (
                      <TypewriterText
                        text={message.text}
                        onTick={scrollChatToBottom}
                        onDone={() => finishStreaming(index)}
                      />
                    ) : (
                      message.text
                    )}
                  </p>
                  {message.comparison && !message.streaming && (
                    <div className="comparison-table-wrap">
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th>Mã</th>
                            <th>Số lượng</th>
                            <th>
                              Giá vốn / cổ ({message.comparison.currency})
                            </th>
                            <th>Giá hiện tại (USD)</th>
                            <th>Vốn mua</th>
                            <th>Giá trị hiện tại</th>
                            <th>Lãi / lỗ</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{message.comparison.ticker}</td>
                            <td>
                              {new Intl.NumberFormat("en-US").format(
                                message.comparison.quantity,
                              )}
                            </td>
                            <td>
                              {message.comparison.currency === "USD"
                                ? dollars(message.comparison.averagePrice)
                                : money(message.comparison.averagePrice)}
                            </td>
                            <td>{dollars(message.comparison.currentPrice)}</td>
                            {message.comparison.currencyMismatch ? (
                              <td colSpan={3}>
                                Không thể so sánh: đơn vị tiền tệ không khớp
                              </td>
                            ) : (
                              <>
                                <td>
                                  {dollars(message.comparison.costBasis ?? 0)}
                                </td>
                                <td>
                                  {dollars(message.comparison.marketValue ?? 0)}
                                </td>
                                <td
                                  className={
                                    (message.comparison.unrealizedPnl ?? 0) >= 0
                                      ? "profit"
                                      : "loss"
                                  }
                                >
                                  {(message.comparison.unrealizedPnl ?? 0) >= 0
                                    ? "+"
                                    : "−"}
                                  {dollars(
                                    Math.abs(
                                      message.comparison.unrealizedPnl ?? 0,
                                    ),
                                  )}
                                  <small>
                                    {" "}
                                    (
                                    {(message.comparison.pnlPercent ?? 0) >= 0
                                      ? "+"
                                      : ""}
                                    {(
                                      message.comparison.pnlPercent ?? 0
                                    ).toFixed(2)}
                                    %)
                                  </small>
                                </td>
                              </>
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="chat-message assistant chat-thinking">
                <span className="message-avatar">✳</span>
                <div className="chat-message-content">
                  <p>
                    <span className="typing-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="thinking-label">
                      Đang kiểm tra dữ liệu danh mục…
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="chat-disclaimer">
            <span>ⓘ</span> Câu trả lời sẽ dựa trên dữ liệu danh mục và giá có
            timestamp.
          </div>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              askAssistant();
            }}
          >
            <textarea
              aria-label="Hỏi về danh mục của bạn"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askAssistant();
                }
              }}
              placeholder="Hỏi về danh mục của bạn…"
              rows={2}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatBusy}
              aria-label="Gửi câu hỏi"
            >
              ↑
            </button>
            <small>Enter để gửi · Shift + Enter để xuống dòng</small>
          </form>
        </section>
      )}
      <button
        className={`chat-launcher ${chatOpen ? "chat-launcher-open" : ""} ${chatOpen && chatFullscreen ? "chat-launcher-hidden" : ""}`}
        onClick={() => {
          setChatOpen((open) => !open);
          setChatFullscreen(false);
        }}
        aria-expanded={chatOpen}
      >
        <span className="launcher-symbol">{chatOpen ? "×" : "✳"}</span>
        {chatOpen ? "Đóng trợ lý" : "Hỏi Stockmate"}
      </button>
    </main>
  );
}
