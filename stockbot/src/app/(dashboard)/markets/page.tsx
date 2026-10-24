import { PageHeader } from "@/components/layout/PageHeader";
import { UsStockLookup } from "@/components/markets/UsStockLookup";
import { WatchlistPanel } from "@/components/watchlist/WatchlistPanel";

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        title="Thị trường"
        description="Theo dõi mã Việt Nam (DNSE) và tra cứu cổ phiếu Mỹ (Finnhub)."
      />
      <WatchlistPanel />
      <UsStockLookup />
    </>
  );
}
