"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";
type OAuthProvider = "google" | "kakao";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirect = search.get("redirect") ?? "/";
  const initialError = search.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<null | "email" | OAuthProvider>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  // OAuth 시작 후 돌아올 콜백 주소. redirect 파라미터를 실어 로그인 후 원래 위치로.
  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    if (redirect && redirect !== "/") url.searchParams.set("redirect", redirect);
    return url.toString();
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading("email");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(redirect);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (error) throw error;
        // 이메일 확인이 켜져 있으면 session 이 없고 확인 메일이 발송됩니다.
        if (!data.session) {
          setNotice(
            "확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료해 주세요."
          );
        } else {
          router.push(redirect);
          router.refresh();
        }
      }
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setNotice(null);
    setLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
      // 성공 시 브라우저가 공급자 로그인 화면으로 이동합니다.
    } catch (err) {
      setError(toMessage(err));
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          썸닥터 <span className="text-[#e0245e]">°C</span>
        </Link>
        <p className="mt-2 text-sm text-ink/60">
          {mode === "signin" ? "다시 오셨네요. 로그인해 주세요." : "몇 초면 시작할 수 있어요."}
        </p>
      </header>

      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-lg border border-[#e0245e33] bg-[#e0245e0d] p-3 text-sm text-[#c01d4f]">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-[#2e9e5b33] bg-[#2e9e5b0d] p-3 text-sm text-[#217a45]">
            {notice}
          </div>
        )}

        {/* 소셜 로그인 */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white py-3 text-sm font-semibold text-ink hover:bg-black/[0.02] disabled:opacity-50"
          >
            <GoogleMark />
            {loading === "google" ? "이동 중…" : "Google로 계속하기"}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("kakao")}
            disabled={loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] hover:brightness-95 disabled:opacity-50"
          >
            <KakaoMark />
            {loading === "kakao" ? "이동 중…" : "카카오로 계속하기"}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
          <span className="h-px flex-1 bg-black/10" />
          또는 이메일로
          <span className="h-px flex-1 bg-black/10" />
        </div>

        {/* 이메일/비밀번호 */}
        <form onSubmit={handleEmail} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink/60">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3.5 py-3 text-sm outline-none focus:border-ink/40"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink/60">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3.5 py-3 text-sm outline-none focus:border-ink/40"
              placeholder="6자 이상"
            />
          </div>
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-xl bg-ink py-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading === "email"
              ? "처리 중…"
              : mode === "signin"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink/60">
          {mode === "signin" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="font-semibold text-[#e0245e] hover:underline"
          >
            {mode === "signin" ? "회원가입" : "로그인"}
          </button>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-ink/40">
        <Link href="/" className="hover:underline">
          ← 로그인 없이 둘러보기
        </Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Supabase 의 대표적인 영문 메시지를 한국어로 다듬습니다.
  if (/invalid login credentials/i.test(raw))
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (/user already registered/i.test(raw))
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (/email not confirmed/i.test(raw))
    return "이메일 확인이 필요해요. 받은 메일의 링크를 눌러 주세요.";
  if (/provider is not enabled/i.test(raw))
    return "이 소셜 로그인이 아직 설정되지 않았어요. (Supabase 대시보드에서 활성화 필요)";
  return raw;
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#191600"
        d="M9 1.5C4.86 1.5 1.5 4.1 1.5 7.3c0 2.06 1.4 3.87 3.5 4.9-.15.53-.56 1.98-.64 2.29-.1.38.14.37.29.27.12-.08 1.86-1.26 2.62-1.78.4.06.81.09 1.23.09 4.14 0 7.5-2.6 7.5-5.8S13.14 1.5 9 1.5z"
      />
    </svg>
  );
}
