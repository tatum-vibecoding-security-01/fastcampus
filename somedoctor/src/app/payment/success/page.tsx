"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Confirmed = {
  orderId: string;
  orderName: string;
  amount: number;
  method: string;
  approvedAt: string;
  receiptUrl: string | null;
};

function SuccessInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"confirming" | "done" | "error">("confirming");
  const [result, setResult] = useState<Confirmed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false); // StrictMode 이중 실행 방지

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = Number(params.get("amount"));
    const productId = params.get("productId");

    if (!paymentKey || !orderId || !amount || !productId) {
      setState("error");
      setError("결제 정보가 올바르지 않습니다.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount, productId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message ?? "결제 승인에 실패했습니다.");
        setResult(data);
        setState("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "결제 승인 중 오류가 발생했습니다.");
        setState("error");
      }
    })();
  }, [params]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      {state === "confirming" && (
        <>
          <div className="text-4xl">⏳</div>
          <h1 className="text-xl font-bold">결제를 승인하고 있어요…</h1>
        </>
      )}

      {state === "done" && result && (
        <>
          <div className="text-4xl">✅</div>
          <h1 className="text-2xl font-bold">결제가 완료됐어요</h1>
          <div className="w-full space-y-2 rounded-2xl border border-ink/10 bg-white p-5 text-left text-sm">
            <Row label="주문명" value={result.orderName} />
            <Row label="주문번호" value={result.orderId} />
            <Row label="결제수단" value={result.method} />
            <Row label="결제금액" value={`${result.amount.toLocaleString()}원`} />
            <Row label="승인시각" value={new Date(result.approvedAt).toLocaleString("ko-KR")} />
          </div>
          {result.receiptUrl && (
            <a
              href={result.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-[#2e9e5b] underline"
            >
              영수증 보기
            </a>
          )}
          <Link href="/payment" className="text-sm text-ink/50 underline">
            다시 테스트하기
          </Link>
        </>
      )}

      {state === "error" && (
        <>
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold">결제 승인에 실패했어요</h1>
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          <Link href="/payment" className="text-sm font-medium text-[#2e9e5b] underline">
            다시 시도하기
          </Link>
        </>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-ink/50">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">불러오는 중…</main>}>
      <SuccessInner />
    </Suspense>
  );
}
