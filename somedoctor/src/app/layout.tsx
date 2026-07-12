import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "썸닥터 — 카카오톡 대화로 보는 관계 온도",
  description:
    "카카오톡 대화를 분석해 관계 온도를 진단하고, 데이터 기반으로 답장을 코칭해주는 연애 상담 서비스. 대화는 저장되지 않습니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
