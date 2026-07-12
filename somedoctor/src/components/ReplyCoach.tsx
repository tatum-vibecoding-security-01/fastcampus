"use client";

import { useState } from "react";
import type { Metrics, ReplyOption } from "@/lib/types";

const toneStyle: Record<string, { badge: string; ring: string; emoji: string }> = {
  안전형: { badge: "bg-[#4a90d922] text-[#2f6aa8]", ring: "border-[#4a90d933]", emoji: "🛟" },
  적극형: { badge: "bg-[#e0245e22] text-[#c01d4f]", ring: "border-[#e0245e33]", emoji: "🔥" },
  위트형: { badge: "bg-[#f5a62322] text-[#b9791a]", ring: "border-[#f5a62333]", emoji: "✨" },
};

export default function ReplyCoach({
  metrics,
  analysisSummary,
  recentContext,
  otherRecent,
}: {
  metrics: Metrics;
  analysisSummary: string;
  recentContext: string;
  otherRecent: string[];
}) {
  const [incoming, setIncoming] = useState("");
  const [options, setOptions] = useState<ReplyOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function getReplies() {
    const msg = incoming.trim();
    if (!msg || busy) return;
    setBusy(true);
    setError(null);
    setOptions([]);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics,
          analysisSummary,
          recentContext,
          incoming: msg,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "답장 제안에 실패했어요.");
        return;
      }
      setOptions(data.options ?? []);
    } catch {
      setError("서버에 연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      /* clipboard 미지원 시 무시 */
    }
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="mb-1 text-sm font-bold">✍️ 답장 코치 · 3안</div>
      <p className="mb-3 text-[11px] text-ink/40">
        상대가 보낸 메시지(또는 지금 보낼 상황)를 넣으면, 톤이 다른 답장 3개를
        데이터 근거와 함께 제안해요.
      </p>

      {otherRecent.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] text-ink/40">
            상대 최근 메시지:
          </span>
          {otherRecent.map((t, i) => (
            <button
              key={i}
              onClick={() => setIncoming(t)}
              title={t}
              className="max-w-[180px] truncate rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-ink/70 hover:bg-black/[0.03]"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={incoming}
        onChange={(e) => setIncoming(e.target.value)}
        rows={2}
        placeholder="예: 상대가 '이번 주말에 뭐해?' 라고 물어봤어"
        className="w-full rounded-lg border border-black/10 p-3 text-sm outline-none focus:border-ink/30"
      />

      <button
        onClick={getReplies}
        disabled={busy || !incoming.trim()}
        className="mt-2 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? "답장 고민 중…" : "답장 3안 받기"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-[#e0245e33] bg-[#e0245e0d] p-3 text-sm text-[#c01d4f]">
          {error}
        </div>
      )}

      {options.length > 0 && (
        <div className="mt-4 space-y-3">
          {options.map((o, i) => {
            const st = toneStyle[o.tone] ?? toneStyle["안전형"];
            return (
              <div key={i} className={`rounded-xl border ${st.ring} p-3.5`}>
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}
                  >
                    {st.emoji} {o.tone}
                  </span>
                  <button
                    onClick={() => copy(o.text, i)}
                    className="text-xs font-medium text-ink/50 hover:text-ink"
                  >
                    {copied === i ? "복사됨 ✓" : "복사"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-black/[0.03] px-3 py-2 text-sm leading-relaxed">
                  {o.text}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-ink/55">
                  💡 {o.rationale}
                </p>
              </div>
            );
          })}
          <button
            onClick={getReplies}
            disabled={busy}
            className="w-full rounded-lg border border-black/10 py-2 text-xs font-semibold text-ink/60 disabled:opacity-40"
          >
            다른 3안 다시 받기
          </button>
        </div>
      )}
    </div>
  );
}
