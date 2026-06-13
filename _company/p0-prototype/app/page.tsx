"use client";
import { useState } from "react";
import { runLocalAI } from "@/lib/wasm-ai";

/**
 * Landing Kit 매핑: Hero -> Input -> Result -> CTA 흐름
 * P0 데모용 단일 페이지. 로그인 없이 즉시 추론 가능하도록 설계.
 */
export default function LandingDemo() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDemo = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const output = await runLocalAI(input);
      setResult(output);
    } catch {
      setResult("에러가 발생했습니다. 콘솔을 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            로컬 AI 엔진 P0 데모
          </h1>
          <p className="text-base md:text-lg text-slate-600">
            로그인 없이 즉시 실행. 데이터 외부 유출 없는 프라이빗 inference.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="여기에 텍스트를 입력하세요 (로컬 WASM 엔진으로 처리됩니다)"
            className="w-full min-h-[120px] resize-none rounded-lg border border-slate-300 p-4 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleDemo}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition"
            >
              {loading ? "추론 중..." : "로컬 추론 실행"}
            </button>
          </div>
        </section>

        {result && (
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 text-left">
            <h3 className="mb-2 font-semibold text-indigo-700">추론 결과</h3>
            <pre className="whitespace-pre-wrap text-sm font-mono text-slate-800">{result}</pre>
          </section>
        )}

        <footer className="pt-6 text-sm text-slate-400">
          Powered by 지노바디AI COMPANY | Next.js + Supabase + WASM
        </footer>
      </div>
    </main>
  );
}