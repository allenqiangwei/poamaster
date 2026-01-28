import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POA Master",
  description: "统一的多工具平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
