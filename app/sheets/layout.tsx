import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구글시트 추첨기",
  description: "구글시트 명단에서 랜덤 추첨",
};

export default function SheetsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
