"use client";

import { useState } from "react";
import type { Metrics, PatternFeedback as Feedback, SelfPatterns } from "@/lib/types";

const levelStyle: Record<string, { badge: string; ring: string; emoji: string }> = {
  good: { badge: "bg-[#2e9e5b22] text-[#2e7d4f]", ring: "border-[#2e9e5b33]", emoji: "🟢" },
  watch: { badge: "bg-[#8a8aa022] text-[#5c5c72]", ring: "border-[#8a8aa033]", emoji: "👀" },
  caution: { badge: "bg-[#e0245e22] text-[#c01d4f]", ring: "border-[#e0245e33]", emoji: "🟠" },
};
const levelLabel: Record<string, string> = {
  good: "건강",
  watch: "지켜보기",
  caution: "조정 권장",
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-center">
      <div className="text-sm font-bold">{value}</div>
      <div className="mt-0.5 text-[10px] text-ink/50">{label}</div>
    </div>
  );
}

export default function PatternFeedback({
  metrics,
  patterns,
}: {
  metrics: Metrics;
  patterns: SelfPatterns;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = patterns;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const speedText =
    p.replySpeedRatio == null
      ? "—"
      : p.replySpeedRatio <= 0
      ? "매우 빠름"
      : p.replySpeedRatio < 1
      ? 1 / p.replySpeedRatio >= 10
        ? "10x+ 빠름"
        : `${(1 / p.replySpeedRatio).toFixed(1)}x 빠름`
      : `${p.replySpeedRatio.toFixed(1)}x 느림`;

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, patterns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "피드백에 실패했어요.");
        return;
      }
      setFeedback(data.feedback ?? null);
    } catch {
      setError("서버에 연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="mb-1 text-sm font-bold">🪞 나의 대화 습관</div>
      <p className="mb-3 text-[11px] text-ink/40">
        상대가 아니라 “내”가 어떻게 대화하는지 데이터로 돌아봐요.
      </p>

      {/* 규칙 기반 자기 지표 (LLM 없이 즉시 표시) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="대화 점유율" value={pct(p.messageShare)} />
        <StatChip label="연속 발신" value={pct(p.doubleTextRatio)} />
        <StatChip label="심야(0~5시)" value={pct(p.lateNightRatio)} />
        <StatChip label="응답 속도" value={speedText} />
      </div>

      {!feedback && (
        <button
          onClick={analyze}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "내 습관 분석 중…" : "AI 습관 피드백 받기"}
        </button>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-[#e0245e33] bg-[#e0245e0d] p-3 text-sm text-[#c01d4f]">
          {error}
        </div>
      )}

      {feedback && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold leading-snug">{feedback.headline}</p>
          {feedback.items.map((it, i) => {
            const st = levelStyle[it.level] ?? levelStyle.watch;
            return (
              <div key={i} className={`rounded-xl border ${st.ring} p-3.5`}>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.badge}`}
                  >
                    {st.emoji} {levelLabel[it.level] ?? ""}
                  </span>
                  <span className="text-sm font-semibold">{it.title}</span>
                </div>
                <p className="text-sm text-ink/70">{it.observation}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink/55">
                  💡 {it.suggestion}
                </p>
              </div>
            );
          })}
          <button
            onClick={analyze}
            disabled={busy}
            className="w-full rounded-lg border border-black/10 py-2 text-xs font-semibold text-ink/60 disabled:opacity-40"
          >
            다시 분석하기
          </button>
        </div>
      )}
    </div>
  );
}
