"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/";

  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error")
  );
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
              redirect
            )}`,
          },
        });
        if (error) throw error;
        // 이메일 인증이 켜져 있으면 세션이 없고 확인 메일이 발송됨.
        if (data.session) {
          router.replace(redirect);
          router.refresh();
        } else {
          setNotice(
            "확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료해 주세요."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(redirect);
        router.refresh();
      }
    } catch (err) {
      setError(toKoreanError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleKakao() {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            redirect
          )}`,
        },
      });
      if (error) throw error;
      // 성공 시 카카오로 리다이렉트되므로 이 아래는 실행되지 않음.
    } catch (err) {
      setError(toKoreanError(err));
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">
        {isSignup ? "회원가입" : "로그인"}
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        {isSignup
          ? "이메일로 가입하거나 카카오로 시작하세요."
          : "이메일 또는 카카오 계정으로 로그인하세요."}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[#e0245e33] bg-[#e0245e0d] p-3 text-sm text-[#c01d4f]">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-[#2e9e5b33] bg-[#2e9e5b0d] p-3 text-sm text-[#217a45]">
          {notice}
        </div>
      )}

      <form onSubmit={handleEmail} className="mt-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-ink/60">이메일</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-ink"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink/60">비밀번호</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-ink"
            placeholder="6자 이상"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "처리 중…" : isSignup ? "이메일로 가입하기" : "로그인"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-ink/40">
        <span className="h-px flex-1 bg-black/10" />
        또는
        <span className="h-px flex-1 bg-black/10" />
      </div>

      <button
        onClick={handleKakao}
        disabled={loading}
        className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-semibold text-[#3C1E1E] hover:opacity-90 disabled:opacity-40"
      >
        카카오로 계속하기
      </button>

      <p className="mt-5 text-center text-sm text-ink/60">
        {isSignup ? (
          <>
            이미 계정이 있나요?{" "}
            <Link
              href={`/login?redirect=${encodeURIComponent(redirect)}`}
              className="font-semibold text-ink underline"
            >
              로그인
            </Link>
          </>
        ) : (
          <>
            아직 계정이 없나요?{" "}
            <Link
              href={`/signup?redirect=${encodeURIComponent(redirect)}`}
              className="font-semibold text-ink underline"
            >
              회원가입
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function toKoreanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Invalid login credentials/i.test(msg))
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (/User already registered/i.test(msg))
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (/Email not confirmed/i.test(msg))
    return "이메일 인증이 완료되지 않았어요. 메일함을 확인해 주세요.";
  if (/provider is not enabled/i.test(msg))
    return "카카오 로그인이 아직 설정되지 않았어요. 잠시 후 다시 시도해 주세요.";
  return msg || "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}
