import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지노바디AI P0 Prototype | 로컬 AI 데모",
  description: "로그인 없이 즉시 사용 가능한 로컬 WASM AI 엔진 데모 UI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}