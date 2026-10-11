"use client";

import { useEffect, useMemo, useState } from "react";

type Market = "HOSE" | "HNX" | "UPCOM";
type Holding = { id: string; ticker: string; name: string; market: Market; shares: number; price: number; change: number | null };
type ChatMessage = { role: "assistant" | "user"; text: string };
type UsQuote = { symbol: string; currency: "USD"; price: number; change: number; changePercent: number; high: number; low: number; open: number; previousClose: number; timestamp: string | null; source: "Finnhub" };
type AppSection = "overview" | "portfolio" | "markets" | "performance";

const sectionLabels: Record<AppSection, string> = { overview: "Tổng quan", portfolio: "Danh mục", markets: "Thị trường", performance: "Hiệu suất" };

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " ₫";

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
  const [snapshotTime, setSnapshotTime] = useState("09/10/2026 08:12");
  const [estimateVisible, setEstimateVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [usSymbol, setUsSymbol] = useState("");
  const [usQuote, setUsQuote] = useState<UsQuote | null>(null);
  const [usQuoteError, setUsQuoteError] = useState("");
  const [usQuoteBusy, setUsQuoteBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>("overview");

  const invested = useMemo(() => holdings.reduce((sum, item) => sum + item.shares * item.price, 0), [holdings]);
  const visibleHoldings = market === "Tất cả" ? holdings : holdings.filter((item) => item.market === market);
  const cash = Math.max(capital - invested, 0);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được danh mục.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setCapital(data.portfolio.capital);
        setHoldings(data.holdings.map((item: { id: string; ticker: string; name: string; exchange: Market; quantity: number; averagePrice: number }) => ({ id: item.id, ticker: item.ticker, name: item.name, market: item.exchange, shares: item.quantity, price: item.averagePrice, change: null })));
      })
      .catch((error: unknown) => { if (active) setApiError(error instanceof Error ? error.message : "Không kết nối được API."); })
      .finally(() => { if (active) setLoadingPortfolio(false); });
    return () => { active = false; };
  }, []);

  async function askAssistant(question = chatInput) {
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    setChatMessages((messages) => [...messages, { role: "user", text: prompt }]);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: prompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Trợ lý chưa lấy được dữ liệu.");
      setChatMessages((messages) => [...messages, { role: "assistant", text: data.answer }]);
    } catch (error) {
      setChatMessages((messages) => [...messages, { role: "assistant", text: error instanceof Error ? error.message : "Chưa gọi được API trợ lý." }]);
    } finally { setChatBusy(false); }
  }

  async function addHolding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol || averagePrice <= 0) return;
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch(editingId ? `/api/holdings/${editingId}` : "/api/holdings", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: symbol, exchange: market === "Tất cả" ? "HOSE" : market, quantity: shares, averagePrice }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được cổ phiếu.");
      const item = data.holding;
      const saved: Holding = { id: item.id, ticker: item.ticker, name: item.name, market: item.exchange, shares: item.quantity, price: item.averagePrice, change: null };
      if (editingId) setHoldings((items) => items.map((holding) => holding.id === editingId ? saved : holding));
      else setHoldings((items) => [...items, saved]);
      setTicker(""); setShares(100); setAveragePrice(0); setEditingId(null); setShowAdd(false);
    } catch (error) { setApiError(error instanceof Error ? error.message : "Không lưu được cổ phiếu."); }
    finally { setSaving(false); }
  }

  async function saveCapital() {
    setSaving(true); setApiError("");
    try {
      const response = await fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capital }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được vốn.");
      setCapital(data.portfolio.capital);
    } catch (error) { setApiError(error instanceof Error ? error.message : "Không lưu được vốn."); }
    finally { setSaving(false); }
  }

  async function deleteHolding(id: string) {
    setApiError("");
    try {
      const response = await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không xóa được cổ phiếu.");
      setHoldings((items) => items.filter((item) => item.id !== id));
    } catch (error) { setApiError(error instanceof Error ? error.message : "Không xóa được cổ phiếu."); }
  }

  async function lookupUsStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = usSymbol.trim().toUpperCase();
    if (!symbol || usQuoteBusy) return;
    setUsQuoteBusy(true); setUsQuoteError(""); setUsQuote(null);
    try {
      const response = await fetch(`/api/market/us/${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tra cứu được mã cổ phiếu.");
      setUsQuote(data.quote);
    } catch (error) { setUsQuoteError(error instanceof Error ? error.message : "Không kết nối được Finnhub."); }
    finally { setUsQuoteBusy(false); }
  }

  function editHolding(item: Holding) {
    setEditingId(item.id); setTicker(item.ticker); setShares(item.shares); setAveragePrice(item.price); setMarket(item.market); setShowAdd(true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark">S</span><span>stock<span className="brand-light">mate</span><small>ĐẦU TƯ CÓ KẾ HOẠCH</small></span></a>
        <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
        <nav className="nav-list" aria-label="Điều hướng chính">
          {(["overview", "portfolio", "markets", "performance"] as AppSection[]).map((section) => <button key={section} type="button" className={`nav-item ${activeSection === section ? "active" : ""}`} onClick={() => setActiveSection(section)}><span>{section === "overview" ? "▦" : section === "portfolio" ? "◫" : section === "markets" ? "⌁" : "↗"}</span> {sectionLabels[section]}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">✳</span><strong>Bắt đầu thật vững</strong><p>Ghi lại vốn và danh mục để theo dõi tài sản của bạn.</p><button type="button" onClick={() => setActiveSection("portfolio")}>Thiết lập danh mục <span>↗</span></button></div><div className="profile"><div className="avatar">B</div><div><strong>Bảo Lê</strong><small>Tài khoản cá nhân</small></div><span className="profile-dots">···</span></div></div>
      </aside>

      <section className="main-area" id="portfolio">
        <header className="topbar"><div className="breadcrumb">Không gian đầu tư <span>/</span> <strong>{sectionLabels[activeSection]}</strong></div><div className="top-actions"><span className="market-status"><i /> Thị trường đang mở</span><button className="icon-button" aria-label="Thông báo">♧<b /></button><div className="top-avatar">B</div></div></header>
        <div className="content">
          <section className="welcome-row"><div><div className="eyebrow"><span className="sparkle">✳</span> KHÔNG GIAN ĐẦU TƯ</div><h1>{activeSection === "overview" ? <>Chào buổi sáng, Bảo <span>✳</span></> : sectionLabels[activeSection]}</h1><p>{activeSection === "overview" ? "Đây là bức tranh tổng quan về khoản đầu tư của bạn." : activeSection === "portfolio" ? "Quản lý vốn và các mã cổ phiếu bạn đang nắm giữ." : activeSection === "markets" ? "Tra cứu giá cổ phiếu quốc tế bằng Finnhub." : "Theo dõi lãi/lỗ và hiệu suất danh mục theo thời gian."}</p></div>{activeSection === "portfolio" && <button className="primary-button" onClick={() => setShowAdd(true)}><span>＋</span> Thêm cổ phiếu</button>}</section>
          {apiError && <div className="api-alert" role="alert"><span>!</span>{apiError}</div>}

          {activeSection === "performance" && <>
          <section className="panel pnl-panel"><div className="pnl-heading"><div><h2>Tổng hợp lãi/lỗ</h2><p>Snapshot mới nhất: {snapshotTime} — {estimateVisible ? "ước tính tạm thời, chưa lưu" : "một phần dùng giá market estimate"}</p></div><span className="demo-badge">DỮ LIỆU MINH HỌA</span></div><div className="pnl-grid"><article className="pnl-card pnl-main"><span>TỔNG GIÁ TRỊ · VND</span><strong>22.601.645 <small>₫</small></strong><p>Theo snapshot đã lưu</p></article><article className="pnl-card"><span>TỔNG GIÁ TRỊ · USD</span><strong>871,44 <small>USD</small></strong><p>Cùng danh mục tài sản</p></article><article className="pnl-card"><span>LỜI/LỖ CHƯA CHỐT · VND</span><strong className="loss">−1.404.208 <small>₫</small></strong><p className="loss-text">−5,85%</p></article><article className="pnl-card"><span>LỜI/LỖ CHƯA CHỐT · USD</span><strong className="loss">−54,14 <small>USD</small></strong><p className="loss-text">−5,85%</p></article></div><div className="pnl-actions"><button className="primary-button" onClick={() => { setSnapshotTime(new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date())); setEstimateVisible(false); }}>Cập nhật giá mới nhất (tạo snapshot)</button><button className="secondary-button" onClick={() => setEstimateVisible((visible) => !visible)}>{estimateVisible ? "Ẩn ước tính nhanh" : "Xem ước tính nhanh (không lưu)"}</button>{estimateVisible && <span className="estimate-note">Ước tính hiển thị tạm thời, không làm thay đổi snapshot.</span>}</div></section>

          <section className="panel yearly-panel"><div className="yearly-heading"><div><h2>Hiệu suất theo năm &amp; lũy kế <span>(all-time)</span></h2><p>Năm hiện tại được cập nhật mỗi khi bấm “Cập nhật giá mới nhất”. Lũy kế tính từ vốn tích lũy của năm liền trước.</p></div><span className="yearly-icon">↗</span></div><div className="yearly-scroll"><table className="yearly-table"><thead><tr><th>NĂM</th><th>VỐN TÍCH LŨY</th><th>GIÁ TRỊ HIỆN TẠI</th><th>LỜI/LỖ TRONG NĂM</th><th>LỜI/LỖ LŨY KẾ (ALL-TIME)</th></tr></thead><tbody><tr><td>2024</td><td>7.670.000 VND<br/><span>295,00 USD</span></td><td>11.900.000 VND<br/><span>476,00 USD</span></td><td className="profit">4.230.000 VND (55,15%)<br/><span>181,00 USD (61,36%)</span></td><td className="profit">0 VND (0,00%)</td></tr><tr><td>2025</td><td>26.506.000 VND<br/><span>1.043,96 USD</span></td><td>30.458.792 VND<br/><span>1.132,09 USD</span></td><td className="loss-text">−277.208 VND (−0,90%)<br/><span>−92,87 USD (−7,58%)</span></td><td className="profit">3.952.792 VND (14,91%)</td></tr><tr className="current-year"><td>2026</td><td>26.506.000 VND<br/><span>1.043,96 USD</span></td><td>22.601.645 VND<br/><span>871,44 USD</span></td><td className="loss-text">−3.904.355 VND (−14,73%)<br/><span>−172,52 USD (−16,53%)</span></td><td className="loss-text">−3.904.355 VND (−14,73%)</td></tr></tbody></table></div></section>
          </>}

          {activeSection === "overview" && <section className="summary-grid" id="capital">
            <article className="summary-card total-card"><div className="card-label">TỔNG TÀI SẢN <button aria-label="Thông tin">ⓘ</button></div><div className="total-number">{money(capital)}</div><div className="total-foot"><span className="positive-chip">↗ 2,38%</span><span className="muted">so với tháng trước</span></div><div className="sparkline"><svg viewBox="0 0 300 62" preserveAspectRatio="none" aria-label="Biểu đồ tài sản"><path d="M0 47 C20 41 26 52 46 39 S75 43 91 29 S119 36 139 27 S168 37 184 19 S209 27 225 17 S253 25 271 10 S290 14 300 4" fill="none" stroke="#55bb92" strokeWidth="2.5"/><path d="M0 47 C20 41 26 52 46 39 S75 43 91 29 S119 36 139 27 S168 37 184 19 S209 27 225 17 S253 25 271 10 S290 14 300 4 V62 H0Z" fill="url(#fade)" opacity=".55"/><defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#55bb92"/><stop offset="1" stopColor="#55bb92" stopOpacity="0"/></linearGradient></defs></svg></div></article>
            <article className="summary-card"><div className="card-label">VỐN ĐÃ ĐẦU TƯ <button aria-label="Thông tin">ⓘ</button></div><div className="metric-number">{money(invested)}</div><div className="allocation"><div className="allocation-bar"><i style={{ width: `${Math.min(invested / Math.max(capital, 1) * 100, 100)}%` }} /></div><div className="allocation-caption"><span>{Math.round(invested / Math.max(capital, 1) * 100)}% vốn</span><span>{holdings.length} mã cổ phiếu</span></div></div><div className="card-icon violet">◈</div></article>
            <article className="summary-card"><div className="card-label">TIỀN MẶT CÒN LẠI <button aria-label="Thông tin">ⓘ</button></div><div className="metric-number">{money(cash)}</div><div className="cash-caption"><span className="cash-dot" /> Sẵn sàng đầu tư</div><div className="card-icon green">↗</div></article>
          </section>}

          {activeSection === "portfolio" && <>
          <section className="summary-grid portfolio-summary">
            <article className="summary-card total-card"><div className="card-label">TỔNG VỐN HIỆN CÓ</div><div className="total-number">{money(capital)}</div><div className="total-foot"><span className="muted">Cập nhật theo dữ liệu danh mục</span></div></article>
            <article className="summary-card"><div className="card-label">VỐN ĐÃ ĐẦU TƯ</div><div className="metric-number">{money(invested)}</div><div className="allocation"><div className="allocation-bar"><i style={{ width: `${Math.min(invested / Math.max(capital, 1) * 100, 100)}%` }} /></div><div className="allocation-caption"><span>{Math.round(invested / Math.max(capital, 1) * 100)}% vốn</span><span>{holdings.length} mã</span></div></div></article>
            <article className="summary-card"><div className="card-label">TIỀN MẶT CÒN LẠI</div><div className="metric-number">{money(cash)}</div><div className="cash-caption"><span className="cash-dot" /> Sẵn sàng đầu tư</div></article>
          </section>
          <section className="middle-grid"><article className="panel capital-panel"><div className="panel-heading"><div><h2>Vốn đầu tư</h2><p>Quản lý số vốn bạn đang có</p></div><span className="edit-tag">● ĐANG THEO DÕI</span></div><label className="field-label" htmlFor="capital-input">Tổng số vốn hiện có</label><div className="capital-input-wrap"><input id="capital-input" type="number" min="0" step="1000000" value={capital} onChange={(e) => setCapital(Number(e.target.value))} /><span>VND</span></div><div className="quick-amounts"><span>Gợi ý:</span>{[100_000_000, 250_000_000, 500_000_000].map((amount) => <button key={amount} className={capital === amount ? "selected" : ""} onClick={() => setCapital(amount)}>{amount / 1_000_000} triệu</button>)}<button className="save-capital" onClick={saveCapital} disabled={saving || loadingPortfolio}>{saving ? "Đang lưu…" : "Lưu vốn"}</button></div><div className="capital-note"><span>✦</span> Vốn được lưu vào danh mục MongoDB của bạn.</div></article>
            <article className="panel market-panel" id="markets"><div className="panel-heading"><div><h2>Phân bổ theo sàn</h2><p>Giá trị danh mục của bạn</p></div><button className="more-button" aria-label="Tùy chọn">···</button></div><div className="market-content"><div className="donut-wrap"><div className="donut"><div><strong>{holdings.length}</strong><small>MÃ CP</small></div></div></div><div className="market-legend">{(["HOSE", "HNX", "UPCOM"] as Market[]).map((exchange) => { const value = holdings.filter((h) => h.market === exchange).reduce((sum, h) => sum + h.shares * h.price, 0); const pct = invested ? Math.round(value / invested * 100) : 0; return <div className="legend-row" key={exchange}><span className={`legend-dot ${exchange.toLowerCase()}`} /><span>{exchange}</span><strong>{pct}%</strong></div>; })}</div></div><div className="market-foot"><span>⌁</span> Phân bổ danh mục theo từng sàn giao dịch</div></article></section>

          </>}
          {activeSection === "markets" && <section className="panel us-market-panel" aria-labelledby="us-market-title"><div className="us-market-heading"><div><span className="us-market-eyebrow">THỊ TRƯỜNG QUỐC TẾ</span><h2 id="us-market-title">Tra cứu cổ phiếu Mỹ</h2><p>Nhập mã niêm yết như AAPL, MSFT hoặc NVDA để xem báo giá bằng USD.</p></div><span className="finnhub-mark">US</span></div><form className="us-lookup-form" onSubmit={lookupUsStock}><label className="sr-only" htmlFor="us-symbol">Mã cổ phiếu Mỹ</label><input id="us-symbol" value={usSymbol} onChange={(event) => setUsSymbol(event.target.value.toUpperCase())} placeholder="Nhập mã, ví dụ AAPL" maxLength={10} required /><button className="primary-button" type="submit" disabled={usQuoteBusy}>{usQuoteBusy ? "Đang tra cứu…" : "Tra cứu giá →"}</button></form>{usQuoteError && <p className="us-quote-error" role="alert">{usQuoteError}</p>}{usQuote && <div className="us-quote-card"><div className="us-quote-main"><span>{usQuote.symbol} · USD · Finnhub</span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.price)}</strong><small className={usQuote.change >= 0 ? "quote-positive" : "quote-negative"}>{usQuote.change >= 0 ? "+" : ""}{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.change)} ({usQuote.changePercent >= 0 ? "+" : ""}{usQuote.changePercent.toFixed(2)}%) so với giá đóng cửa trước</small></div><div className="us-quote-stats"><span>Cao nhất hôm nay <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.high)}</strong></span><span>Thấp nhất hôm nay <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.low)}</strong></span><span>Mở cửa <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.open)}</strong></span><span>Đóng cửa trước <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usQuote.previousClose)}</strong></span></div><small className="us-quote-time">{usQuote.timestamp ? `Thời điểm Finnhub: ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(usQuote.timestamp))} (giờ New York)` : "Finnhub chưa trả timestamp cho báo giá này."}</small></div>}<div className="us-market-foot">Giá tùy thuộc quyền truy cập và độ trễ của gói Finnhub. API key được giữ ở máy chủ.</div></section>}

          {activeSection === "portfolio" && <section className="panel holdings-panel" id="holdings"><div className="holdings-heading"><div><h2>Cổ phiếu của bạn</h2><p>Giá vốn và số lượng đang nắm giữ trên từng sàn</p></div><button className="text-button" onClick={() => setShowAdd(true)}>＋ Thêm mã mới</button></div><div className="table-toolbar"><div className="tabs">{(["Tất cả", "HOSE", "HNX", "UPCOM"] as const).map((item) => <button key={item} className={market === item ? "tab active-tab" : "tab"} onClick={() => setMarket(item)}>{item}{item === "Tất cả" && <span>{holdings.length}</span>}</button>)}</div><button className="filter-button">☷ <span>Lọc</span></button></div><div className="table-scroll"><table><thead><tr><th>MÃ CỔ PHIẾU</th><th>SÀN</th><th className="align-right">KHỐI LƯỢNG</th><th className="align-right">GIÁ VỐN TB</th><th className="align-right">TỔNG GIÁ VỐN</th><th className="align-right">GIÁ THỊ TRƯỜNG</th><th /></tr></thead><tbody>{visibleHoldings.length ? visibleHoldings.map((item) => <tr key={item.id}><td><div className="stock-name"><span className={`stock-logo logo-${item.ticker.toLowerCase()}`}>{item.ticker.slice(0, 1)}</span><div><strong>{item.ticker}</strong><small>{item.name}</small></div></div></td><td><span className={`exchange-badge ${item.market.toLowerCase()}`}>{item.market}</span></td><td className="align-right">{new Intl.NumberFormat("vi-VN").format(item.shares)}</td><td className="align-right">{new Intl.NumberFormat("vi-VN").format(item.price)} ₫</td><td className="align-right value-cell">{money(item.shares * item.price)}</td><td className="align-right"><span className="muted">Chưa có dữ liệu giá</span></td><td><button className="row-menu" aria-label={`Sửa ${item.ticker}`} onClick={() => editHolding(item)}>✎</button><button className="row-menu delete-menu" aria-label={`Xóa ${item.ticker}`} onClick={() => deleteHolding(item.id)}>×</button></td></tr>) : <tr><td className="empty-state" colSpan={7}>{loadingPortfolio ? "Đang tải danh mục…" : "Chưa có mã cổ phiếu trên sàn này."}</td></tr>}</tbody></table></div><div className="table-footer"><span>Đang hiển thị <strong>{visibleHoldings.length}</strong> / {holdings.length} mã</span><button onClick={() => setShowAdd(true)}>Thêm mã <span>＋</span></button></div></section>}
          <footer className="page-footer"><span>© 2026 Stockmate</span><span>Dữ liệu danh mục được cập nhật thủ công <i /> Đơn vị tiền tệ: VND</span></footer>
        </div>
      </section>
      {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><form className="add-modal" onSubmit={addHolding} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowAdd(false)}>×</button><span className="modal-icon">＋</span><h2>{editingId ? "Cập nhật cổ phiếu" : "Thêm cổ phiếu"}</h2><p>Nhập số lượng và giá vốn trung bình để lưu vào danh mục.</p><label htmlFor="ticker">Mã cổ phiếu</label><input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ví dụ: FPT" maxLength={12} required disabled={Boolean(editingId)} /><label htmlFor="exchange">Sàn giao dịch</label><select id="exchange" value={market === "Tất cả" ? "HOSE" : market} onChange={(e) => setMarket(e.target.value as Market)}><option>HOSE</option><option>HNX</option><option>UPCOM</option></select><label htmlFor="shares">Số lượng cổ phiếu</label><input id="shares" type="number" min="1" value={shares} onChange={(e) => setShares(Number(e.target.value))} required /><label htmlFor="average-price">Giá vốn trung bình (VND)</label><input id="average-price" type="number" min="1" step="100" value={averagePrice || ""} onChange={(e) => setAveragePrice(Number(e.target.value))} required /><button className="primary-button modal-submit" type="submit" disabled={saving}>{saving ? "Đang lưu…" : editingId ? "Lưu thay đổi →" : "Thêm vào danh mục →"}</button></form></div>}
      {chatOpen && <section className="chat-panel" aria-label="Trợ lý Stockmate"><header className="chat-header"><div className="chat-brand"><span className="chat-avatar">✳</span><div><strong>Trợ lý Stockmate</strong><small><i /> Sẵn sàng hỗ trợ</small></div></div><button className="chat-close" onClick={() => setChatOpen(false)} aria-label="Đóng chat">×</button></header><div className="chat-scope"><span>◫</span> Đang xem danh mục của bạn <span className="scope-chevron">⌄</span></div><div className="chat-body"><div className="chat-welcome"><span className="chat-welcome-icon">✳</span><h3>Xin chào, Bảo!</h3><p>Mình có thể giúp bạn hiểu rõ hơn về danh mục đầu tư.</p></div><div className="chat-questions"><span className="suggestion-label">THỬ HỎI</span><button onClick={() => askAssistant("Mã nào đang lãi nhiều nhất?")}>Mã nào đang lãi nhiều nhất? <span>↗</span></button><button onClick={() => askAssistant("Tóm tắt danh mục của tôi hôm nay")}>Tóm tắt danh mục hôm nay <span>↗</span></button><button onClick={() => askAssistant("Phân bổ cổ phiếu theo từng sàn ra sao?")}>Danh mục phân bổ theo sàn ra sao? <span>↗</span></button></div>{chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}><span className="message-avatar">{message.role === "assistant" ? "✳" : "B"}</span><p>{message.text}</p></div>)}{chatBusy && <div className="chat-message assistant"><span className="message-avatar">✳</span><p>Đang tra cứu dữ liệu SSI…</p></div>}</div><div className="chat-disclaimer"><span>ⓘ</span> Câu trả lời sẽ dựa trên dữ liệu danh mục và giá có timestamp.</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); askAssistant(); }}><textarea aria-label="Hỏi về danh mục của bạn" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askAssistant(); } }} placeholder="Hỏi về danh mục của bạn…" rows={2} /><button type="submit" disabled={!chatInput.trim() || chatBusy} aria-label="Gửi câu hỏi">↑</button><small>Enter để gửi · Shift + Enter để xuống dòng</small></form></section>}
      <button className={`chat-launcher ${chatOpen ? "chat-launcher-open" : ""}`} onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen}><span className="launcher-symbol">{chatOpen ? "×" : "✳"}</span>{chatOpen ? "Đóng trợ lý" : "Hỏi Stockmate"}</button>
    </main>
  );
}
