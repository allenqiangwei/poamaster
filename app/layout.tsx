import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

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
    <html lang="zh-CN" className={`${plusJakarta.variable} ${notoSansSC.variable}`}>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
