import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function StockPage({
  params,
}: PageProps<"/stock/[symbol]">) {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) notFound();

  return (
    <PageHeader
      title={symbol}
      description="Biểu đồ giá và vị thế của bạn với mã này."
    />
  );
}
