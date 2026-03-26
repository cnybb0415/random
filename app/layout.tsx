import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "트위터 리트윗 추첨기",
  description: "트윗 리트윗한 사람 중 랜덤 추첨",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-[#ededed]">
        {children}
      </body>
    </html>
  );
}
