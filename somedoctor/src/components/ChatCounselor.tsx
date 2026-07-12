"use client";

import { useRef, useState, useEffect } from "react";
import type { Metrics } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "왜 온도가 이렇게 나왔어?",
  "지금 이 사람한테 어떻게 답장하면 좋을까?",
  "내가 너무 들이대고 있는 건 아닐까?",
  "다음에 만나자고 어떻게 말 꺼내지?",
];

export default function ChatCounselor({
  metrics,
  analysisSummary,
}: {
  metrics: Metrics;
  analysisSummary: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "데이터를 다 봤어요. 지금 관계에 대해 궁금한 걸 물어보세요. 답장 문구가 고민이면 상황을 알려주면 데이터에 맞춰 제안해 드릴게요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    const history: Msg[] = [...messages, { role: "user", content: q }];
    // 스트리밍으로 채울 assistant 자리
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics,
          analysisSummary,
          // 첫 인사말(assistant)은 컨텍스트에서 제외하고 실제 대화만 전송
          messages: history.filter(
            (_, i) => !(i === 0 && history[0].role === "assistant")
          ),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "요청 실패");
        appendToLast(errText || "요청에 실패했어요.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        appendToLast(decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToLast("\n\n[연결 오류] 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function appendToLast(chunk: string) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, content: last.content + chunk };
      return copy;
    });
  }

  return (
    <div className="flex h-[560px] flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="border-b border-black/5 px-4 py-3">
        <div className="text-sm font-bold">💬 데이터 기반 상담</div>
        <div className="text-[11px] text-ink/40">
          근거 있는 조언 · 판단은 당신의 몫
        </div>
      </div>

      <div ref={scrollRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-ink text-white"
                  : "bg-black/[0.04] text-ink"
              }`}
            >
              {m.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-ink/70 hover:bg-black/[0.03]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-black/5 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="궁금한 걸 물어보세요…"
          className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  );
}
