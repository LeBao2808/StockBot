import { PageHeader } from "@/components/layout/PageHeader";
import { UsStockLookup } from "@/components/markets/UsStockLookup";

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        title="Thị trường"
        description="Tra cứu giá cổ phiếu quốc tế bằng Finnhub."
      />
      <UsStockLookup />
    </>
  );
}
