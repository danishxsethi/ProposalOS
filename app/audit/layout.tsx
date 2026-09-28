import DashboardGroupLayout from '@/app/(dashboard)/layout';

/** Audit detail lives outside the (dashboard) route group but must render inside the app shell. */
export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <DashboardGroupLayout>{children}</DashboardGroupLayout>;
}
