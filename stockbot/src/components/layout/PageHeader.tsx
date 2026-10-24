"use client";

import { usePortfolio } from "@/components/portfolio/PortfolioProvider";

/** Page title row plus the shared API error banner. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description: string;
  action?: React.ReactNode;
}) {
  const { apiError } = usePortfolio();
  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="sparkle">✳</span> KHÔNG GIAN ĐẦU TƯ
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </section>
      {apiError && (
        <div className="api-alert" role="alert">
          <span>!</span>
          {apiError}
        </div>
      )}
    </>
  );
}
