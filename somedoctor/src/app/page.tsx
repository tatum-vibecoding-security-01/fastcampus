"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { parseKakao } from "@/lib/kakaoParser";
import { validateTextUpload } from "@/lib/uploadSecurity";
import {
  computeMetrics,
  computeSelfPatterns,
  sampleConversation,
} from "@/lib/metrics";
import type { Analysis, KakaoMessage, Metrics } from "@/lib/types";
import ResultDashboard from "@/components/ResultDashboard";
import ChatCounselor from "@/components/ChatCounselor";
import ReplyCoach from "@/components/ReplyCoach";
import PatternFeedback from "@/components/PatternFeedback";

type Step = "landing" | "speaker" | "loading" | "result";

const PrivacyBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#2e9e5b15] px-3 py-1 text-xs font-medium text-[#2e9e5b]">
    🔒 대화는 저장되지 않아요 · 분석 후 즉시 파기
  </span>
);

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);

  const [step, setStep] = useState<Step>("landing");
  const [error, setError] = useState<string | null>(null);

  // 로그인 상태 추적 (헤더 표시 + 분석 게이팅용)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  const [messages, setMessages] = useState<KakaoMessage[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [me, setMe] = useState<string>("");

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const other = useMemo(
    () => speakers.find((s) => s !== me) ?? "",
    [speakers, me]
  );

  // 답장 코치용 컨텍스트: 최근 대화 발췌 + 상대의 최근 메시지(퀵픽용)
  const coachInputs = useMemo(() => {
    if (!me || !other) return { recentContext: "", otherRecent: [] as string[] };
    const recentContext = sampleConversation(messages, me, other, 30);
    const otherRecent = messages
      .filter((m) => m.speaker === other && m.text.trim().length > 1)
      .slice(-6)
      .map((m) => m.text.replace(/\n/g, " ").trim())
      .reverse();
    return { recentContext, otherRecent };
  }, [messages, me, other]);

  // 나의 대화 습관 지표 (진단 완료 후 metrics 기준으로 계산)
  const selfPatterns = useMemo(
    () =>
      metrics && me && other
        ? computeSelfPatterns(messages, me, other, metrics)
        : null,
    [messages, me, other, metrics]
  );

  function ingest(raw: string) {
    setError(null);
    const parsed = parseKakao(raw);
    if (parsed.speakers.length < 2) {
      setError(
        "1:1 대화를 인식하지 못했어요. 카카오톡 '대화 내보내기'로 저장한 .txt 파일인지 확인해 주세요. (단체방은 지원하지 않아요)"
      );
      return;
    }
    if (parsed.speakers.length > 8) {
      setError(
        "화자가 너무 많아요. 1:1 대화만 분석할 수 있어요. (단체방 미지원)"
      );
      return;
    }
    setMessages(parsed.messages);
    setSpeakers(parsed.speakers);
    setMe(parsed.speakers[0]);
    setStep("speaker");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);

    try {
      // 1차(클라이언트): 크기·UTF-8 텍스트 검사로 빠르게 거부 (불필요한 업로드 방지)
      const buf = await f.arrayBuffer();
      const local = validateTextUpload(buf);
      if (!local.ok) {
        setError(local.error);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      // 2차(서버): 동일 검사 + 파일명 랜덤 재생성/검증. 서버가 정제한 텍스트로 파싱.
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "파일 검증에 실패했어요.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      ingest(String(data.text ?? ""));
    } catch {
      setError("파일을 읽는 중 문제가 발생했어요. 다시 시도해 주세요.");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runAnalysis() {
    if (!me || !other) return;

    // 분석 실행 시점에 로그인 요구. 미로그인이면 로그인 후 복귀.
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (!current) {
      router.push(`/login?redirect=${encodeURIComponent("/")}`);
      return;
    }

    setStep("loading");
    setError(null);

    // 파싱·지표 계산은 브라우저에서. 서버로는 익명화된 지표 + 대화 샘플만 전송.
    const m = computeMetrics(messages, me, other);
    const sample = sampleConversation(messages, me, other, 60);
    setMetrics(m);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: m, sample }),
      });
      if (res.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent("/")}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "분석에 실패했어요.");
        setStep("speaker");
        return;
      }
      setAnalysis(data.analysis);
      setStep("result");
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStep("speaker");
    }
  }

  function reset() {
    setStep("landing");
    setMessages([]);
    setSpeakers([]);
    setMe("");
    setMetrics(null);
    setAnalysis(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      {/* 상단 인증 바 */}
      <div className="mb-4 flex items-center justify-end gap-3 text-xs">
        {user ? (
          <>
            <span className="text-ink/50">{user.email ?? "로그인됨"}</span>
            <button
              onClick={signOut}
              className="rounded-full border border-black/10 px-3 py-1 font-medium text-ink/70 hover:bg-black/[0.03]"
            >
              로그아웃
            </button>
          </>
        ) : (
          <a
            href="/login"
            className="rounded-full border border-black/10 px-3 py-1 font-medium text-ink/70 hover:bg-black/[0.03]"
          >
            로그인
          </a>
        )}
      </div>

      {/* 헤더 */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          썸닥터 <span className="text-[#e0245e]">°C</span>
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          카카오톡 대화로 보는 관계 온도 · 데이터 기반 연애 상담
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-[#e0245e33] bg-[#e0245e0d] p-3 text-sm text-[#c01d4f]">
          {error}
        </div>
      )}

      {/* 1. 랜딩 / 업로드 */}
      {step === "landing" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="mb-4 flex justify-center">
              <PrivacyBadge />
            </div>
            <ul className="mb-5 space-y-2 text-sm text-ink/70">
              <li>📊 관계 온도(0~100°)와 핵심 신호를 진단</li>
              <li>💬 “이럴 땐 어떻게 답장하지?” 실시간 답장 코칭</li>
              <li>🧊 냉정하고 근거 있는 “데이터 기반 분석가” 상담</li>
            </ul>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl bg-ink py-3.5 text-sm font-semibold text-white hover:opacity-90"
            >
              대화 파일(.txt) 올리고 무료로 진단하기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              onChange={onFile}
              className="hidden"
            />

            <div className="mt-4">
              <PasteBox onSubmit={ingest} />
            </div>
          </div>

          <details className="rounded-xl border border-black/5 bg-white p-4 text-sm text-ink/70">
            <summary className="cursor-pointer font-semibold">
              대화 내보내는 방법
            </summary>
            <div className="mt-3 space-y-1.5 text-ink/60">
              <p>
                <b>모바일:</b> 대화방 → 메뉴(≡) → 설정 → 대화 내용 내보내기 →
                텍스트만 → 파일 저장/공유
              </p>
              <p>
                <b>PC:</b> 대화창 우측 상단 메뉴 → 대화 내용 → 대화 내보내기 →
                .txt 저장
              </p>
              <p className="pt-1 text-[#2e9e5b]">
                업로드한 대화는 서버에 저장하지 않고, 분석 직후 폐기합니다.
              </p>
            </div>
          </details>
        </section>
      )}

      {/* 2. 화자 지정 */}
      {step === "speaker" && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">본인은 누구인가요?</h2>
            <p className="mt-1 text-sm text-ink/60">
              대화에서 “나”에 해당하는 이름을 골라주세요.
            </p>
            <div className="mt-4 space-y-2">
              {speakers.map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                    me === s
                      ? "border-ink bg-ink/[0.03]"
                      : "border-black/10 hover:bg-black/[0.02]"
                  }`}
                >
                  <input
                    type="radio"
                    name="me"
                    checked={me === s}
                    onChange={() => setMe(s)}
                  />
                  <span className="font-medium">{s}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink/40">
              분석 대상: <b>{me || "?"}</b> ↔ <b>{other || "?"}</b> · 총{" "}
              {messages.length}개 메시지 인식
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-xl border border-black/10 py-3 text-sm font-semibold"
            >
              다시 올리기
            </button>
            <button
              onClick={runAnalysis}
              disabled={!me || !other}
              className="flex-[2] rounded-xl bg-ink py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              관계 온도 진단하기
            </button>
          </div>
        </section>
      )}

      {/* 3. 로딩 */}
      {step === "loading" && (
        <section className="flex flex-col items-center py-16">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-black/10 border-t-[#e0245e]" />
          <p className="mt-5 text-sm font-medium">대화를 분석하고 있어요…</p>
          <p className="mt-1 text-xs text-ink/40">
            데이터는 저장되지 않습니다. 잠시만요.
          </p>
        </section>
      )}

      {/* 4. 결과 + 상담 */}
      {step === "result" && metrics && analysis && (
        <section className="space-y-6">
          <ResultDashboard metrics={metrics} analysis={analysis} />
          {selfPatterns && (
            <PatternFeedback metrics={metrics} patterns={selfPatterns} />
          )}
          <ReplyCoach
            metrics={metrics}
            analysisSummary={`${analysis.headline} ${analysis.summary}`}
            recentContext={coachInputs.recentContext}
            otherRecent={coachInputs.otherRecent}
          />
          <ChatCounselor
            metrics={metrics}
            analysisSummary={`${analysis.headline} ${analysis.summary}`}
          />
          <button
            onClick={reset}
            className="w-full rounded-xl border border-black/10 py-3 text-sm font-semibold"
          >
            새 대화 분석하기
          </button>
          <p className="pb-4 text-center text-[11px] leading-relaxed text-ink/40">
            본 진단은 대화 데이터의 경향성 분석이며 확정적 판단이 아닙니다. 이
            대화 기록은 저장되지 않았습니다.
          </p>
        </section>
      )}
    </main>
  );
}

function PasteBox({ onSubmit }: { onSubmit: (raw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-center text-xs text-ink/50 underline underline-offset-2"
      >
        또는 대화 내용 직접 붙여넣기
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="카카오톡 대화 내용을 붙여넣으세요…"
        className="w-full rounded-lg border border-black/10 p-3 text-sm outline-none focus:border-ink/30"
      />
      <button
        onClick={() => text.trim() && onSubmit(text)}
        disabled={!text.trim()}
        className="w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        이 내용으로 진단하기
      </button>
    </div>
  );
}
