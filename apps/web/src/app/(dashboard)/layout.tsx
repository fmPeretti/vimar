import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const loginConfigured = Boolean(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);

  return (
    <div className="vm-shell">
      <Sidebar showLogout={loginConfigured} />
      <main className="vm-main">{children}</main>
    </div>
  );
}
