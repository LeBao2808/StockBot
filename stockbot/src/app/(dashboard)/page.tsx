import { PageHeader } from "@/components/layout/PageHeader";
import { OverviewSummary } from "@/components/portfolio/OverviewSummary";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title={
          <>
            Chào buổi sáng, Bảo <span>✳</span>
          </>
        }
        description="Đây là bức tranh tổng quan về khoản đầu tư của bạn."
      />
      <OverviewSummary />
    </>
  );
}
