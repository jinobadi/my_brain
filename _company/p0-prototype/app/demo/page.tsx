"use client";
import { useState } from "react";
import { runLocalAI } from "@/lib/wasm-ai";

/**
 * Dashboard Kit 매핑: Sidebar/Stats -> Table/Log -> Realtime Update 흐름
 * 관리자/운영 대시보드 스타일. 처리량 모니터링 및 로그 추적 데모.
 */
export default function DashboardDemo() {
  const [logs, setLogs] = useState<{ input: string; output: string; ts: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const output = await runLocalAI(input);
      setLogs((prev) => [
        { input, output, ts: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      setInput("");
    } catch (err) {
      console.error("Demo run failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">📊 P0 Dashboard: 로컬 AI 처리 대시보드</h2>
          <span className="text-xs font-mono text-slate-400">STATUS: ACTIVE</span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Input Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600">입력 데이터</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
              rows={4}
              placeholder="로컬 엔진에 전달할 데이터..."
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleRun}
                disabled={loading || !input.trim()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {loading ? "처리 중..." : "데이터 처리"}
              </button>
            </div>
          </div>

          {/* Stats Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-slate-500">처리 현황</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">총 처리량</span>
                <span className="font-mono font-bold text-slate-800">{logs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">에이전트 상태</span>
                <span className="text-sm font-bold text-green-600">정상</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">WASM 엔진</span>
                <span className="text-sm font-bold text-indigo-600">로딩됨</span>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800">추론 로그</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">시간</th>
                  <th className="px-4 py-3 font-medium">입력</th>
                  <th className="px-4 py-3 font-medium">출력</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                      아직 처리된 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ts}</td>
                      <td className="px-4 py-3 text-slate-700">{log.input}</td>
                      <td className="px-4 py-3 text-slate-600">{log.output}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}