export function Topbar({ title }: { title: string }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        Không gian đầu tư <span>/</span> <strong>{title}</strong>
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
  );
}
