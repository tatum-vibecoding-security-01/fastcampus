"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type State =
  | { kind: "confirming" }
  | { kind: "success"; orderName?: string }
  | { kind: "error"; message: string };

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessInner />
    </Suspense>
  );
}

// 토스가 successUrl 로 붙여 보낸 paymentKey/orderId/amount 를 서버 승인 API 로 전달한다.
// 실제 승인·검증(금액 대조 포함)은 전적으로 서버에서 이뤄진다.
function PaymentSuccessInner() {
  const params = useSearchParams();
  const [state, setState] = useState<State>({ kind: "confirming" });
  const confirmed = useRef(false); // StrictMode 중복 호출 방지

  useEffect(() => {
    if (confirmed.current) return;
    confirmed.current = true;

    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = Number(params.get("amount"));

    if (!paymentKey || !orderId || !amount) {
      setState({ kind: "error", message: "결제 정보가 올바르지 않습니다." });
      return;
    }

    fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setState({
            kind: "error",
            message: data.error ?? "결제 승인에 실패했어요.",
          });
          return;
        }
        setState({ kind: "success", orderName: data.orderName });
      })
      .catch(() =>
        setState({ kind: "error", message: "서버에 연결하지 못했어요." })
      );
  }, [params]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      {state.kind === "confirming" && (
        <>
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-black/10 border-t-[#e0245e]" />
          <p className="mt-5 text-sm font-medium">결제를 확인하고 있어요…</p>
        </>
      )}

      {state.kind === "success" && (
        <div className="w-full rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
          <div className="text-4xl">✅</div>
          <h1 className="mt-3 text-xl font-bold">결제가 완료됐어요</h1>
          <p className="mt-2 text-sm text-ink/60">
            {state.orderName ?? "프리미엄 리포트"} 이용이 활성화됐어요.
          </p>
          <a
            href="/"
            className="mt-6 inline-block w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            프리미엄 리포트 보러 가기
          </a>
        </div>
      )}

      {state.kind === "error" && (
        <div className="w-full rounded-2xl border border-[#e0245e33] bg-white p-8 shadow-sm">
          <div className="text-4xl">⚠️</div>
          <h1 className="mt-3 text-xl font-bold">결제를 완료하지 못했어요</h1>
          <p className="mt-2 text-sm text-[#c01d4f]">{state.message}</p>
          <a
            href="/"
            className="mt-6 inline-block w-full rounded-xl border border-black/10 py-3 text-sm font-semibold hover:bg-black/[0.03]"
          >
            홈으로 돌아가기
          </a>
        </div>
      )}
    </main>
  );
}
