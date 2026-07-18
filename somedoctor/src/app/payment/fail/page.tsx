"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function FailInner() {
  const params = useSearchParams();
  // 토스는 실패 시 code, message, orderId를 failUrl 쿼리로 전달한다.
  const code = params.get("code");
  const message = params.get("message");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <div className="text-4xl">❌</div>
      <h1 className="text-2xl font-bold">결제에 실패했어요</h1>
      <div className="w-full space-y-2 rounded-2xl border border-ink/10 bg-white p-5 text-left text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-ink/50">사유</span>
          <span className="text-right font-medium">{message ?? "알 수 없는 오류"}</span>
        </div>
        {code && (
          <div className="flex justify-between gap-3">
            <span className="text-ink/50">코드</span>
            <span className="text-right font-medium">{code}</span>
          </div>
        )}
      </div>
      <Link href="/payment" className="text-sm font-medium text-[#2e9e5b] underline">
        다시 시도하기
      </Link>
    </main>
  );
}

export default function FailPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">불러오는 중…</main>}>
      <FailInner />
    </Suspense>
  );
}
