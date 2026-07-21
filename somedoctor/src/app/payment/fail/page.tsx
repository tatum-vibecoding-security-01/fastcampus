"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function PaymentFailPage() {
  return (
    <Suspense fallback={null}>
      <PaymentFailInner />
    </Suspense>
  );
}

// 토스가 failUrl 로 붙여 보낸 code/message 를 안내한다. (결제 취소·실패 시)
function PaymentFailInner() {
  const params = useSearchParams();
  const code = params.get("code");
  const message = params.get("message");

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full rounded-2xl border border-[#e0245e33] bg-white p-8 shadow-sm">
        <div className="text-4xl">🚫</div>
        <h1 className="mt-3 text-xl font-bold">결제가 취소됐어요</h1>
        <p className="mt-2 text-sm text-[#c01d4f]">
          {message ?? "결제가 완료되지 않았어요."}
        </p>
        {code && <p className="mt-1 text-xs text-ink/40">오류 코드: {code}</p>}
        <a
          href="/"
          className="mt-6 inline-block w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          다시 시도하기
        </a>
      </div>
    </main>
  );
}
