import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rkyves Cloud",
  description: "Internal PaaS for Rkyves projects",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
