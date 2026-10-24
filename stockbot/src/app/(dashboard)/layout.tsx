import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <DashboardShell>{children}</DashboardShell>;
}
