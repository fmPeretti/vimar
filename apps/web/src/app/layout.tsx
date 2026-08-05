import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vimar Ops",
  description: "Materials, patterns and finished-stock tracking for Vimar Stitches.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="vm-shell">
          <Sidebar />
          <main className="vm-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
