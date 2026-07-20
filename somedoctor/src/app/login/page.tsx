import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "로그인 — 썸닥터" };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <header className="mb-8 text-center">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          썸닥터 <span className="text-[#e0245e]">°C</span>
        </Link>
      </header>
      <Suspense fallback={<div className="text-center text-sm text-ink/40">불러오는 중…</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
