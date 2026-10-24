import { PageHeader } from "@/components/layout/PageHeader";
import { PerformanceSection } from "@/components/portfolio/PerformanceSection";

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        title="Hiệu suất"
        description="Theo dõi lãi/lỗ và hiệu suất danh mục theo thời gian."
      />
      <PerformanceSection />
    </>
  );
}
