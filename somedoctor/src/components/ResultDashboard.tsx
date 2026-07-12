"use client";

import type { Analysis, Metrics } from "@/lib/types";
import TemperatureGauge from "./TemperatureGauge";

const toneStyle: Record<string, string> = {
  positive: "border-l-[#2e9e5b] bg-[#2e9e5b0d]",
  neutral: "border-l-[#8a8aa0] bg-[#8a8aa00d]",
  caution: "border-l-[#e0245e] bg-[#e0245e0d]",
};
const toneEmoji: Record<string, string> = {
  positive: "🟢",
  neutral: "⚪",
  caution: "🟠",
};

function fmtReply(v: number | null): string {
  if (v == null) return "—";
  return v < 60 ? `${Math.round(v)}분` : `${(v / 60).toFixed(1)}시간`;
}

function MetricCard({
  label,
  me,
  other,
  hint,
}: {
  label: string;
  me: string;
  other: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-ink/50">{label}</div>
      <div className="mt-2 flex items-baseline justify-between text-sm">
        <span className="text-ink/60">나</span>
        <span className="font-bold">{me}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-sm">
        <span className="text-ink/60">상대</span>
        <span className="font-bold">{other}</span>
      </div>
      {hint && <div className="mt-2 text-[11px] text-ink/40">{hint}</div>}
    </div>
  );
}

export default function ResultDashboard({
  metrics,
  analysis,
}: {
  metrics: Metrics;
  analysis: Analysis;
}) {
  const m = metrics;
  return (
    <div className="space-y-6">
      {/* 온도 + 헤드라인 */}
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <TemperatureGauge value={analysis.temperature} />
        <p className="mt-4 text-center text-lg font-bold leading-snug">
          {analysis.headline}
        </p>
        <p className="mt-3 text-center text-sm leading-relaxed text-ink/70">
          {analysis.summary}
        </p>
      </div>

      {/* 핵심 신호 3 */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/70">핵심 신호</h3>
        <div className="space-y-2">
          {analysis.signals.map((s, i) => (
            <div
              key={i}
              className={`rounded-lg border-l-4 p-3 ${
                toneStyle[s.tone] ?? toneStyle.neutral
              }`}
            >
              <div className="text-sm font-semibold">
                {toneEmoji[s.tone] ?? "⚪"} {s.title}
              </div>
              <div className="mt-1 text-sm text-ink/70">{s.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 정량 지표 */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/70">
          정량 지표 · {m.spanDays}일 / {m.totalMessages}개 메시지
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard
            label="메시지 수"
            me={`${m.messageCount.me}`}
            other={`${m.messageCount.other}`}
          />
          <MetricCard
            label="평균 길이"
            me={`${m.avgLength.me}자`}
            other={`${m.avgLength.other}자`}
          />
          <MetricCard
            label="응답 속도(중앙값)"
            me={fmtReply(m.medianReplyMinutes.me)}
            other={fmtReply(m.medianReplyMinutes.other)}
            hint="상대가 나에게 답하는 속도"
          />
          <MetricCard
            label="먼저 말 건 횟수"
            me={`${m.initiations.me}`}
            other={`${m.initiations.other}`}
          />
          <MetricCard
            label="질문 비율"
            me={`${(m.questionRatio.me * 100).toFixed(0)}%`}
            other={`${(m.questionRatio.other * 100).toFixed(0)}%`}
            hint="관심의 신호"
          />
          <MetricCard
            label="감정표현 비율"
            me={`${(m.affectionRatio.me * 100).toFixed(0)}%`}
            other={`${(m.affectionRatio.other * 100).toFixed(0)}%`}
            hint="ㅋㅋ·이모티콘·하트 등"
          />
        </div>
      </div>
    </div>
  );
}
