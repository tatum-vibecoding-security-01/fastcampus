"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

// 프리미엄 리포트 결제 버튼.
// 1) 서버에 주문 생성 요청(/api/payments/create-order) → orderId/amount 를 서버가 확정
// 2) 서버가 준 값 그대로 토스 결제창(requestPayment) 호출
// 결제 성공 시 successUrl 로, 실패/취소 시 failUrl 로 리다이렉트된다.
export default function CheckoutButton({ label }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setError(null);

    if (!CLIENT_KEY) {
      setError("결제 설정이 없습니다. 관리자에게 문의해 주세요.");
      return;
    }

    setLoading(true);
    try {
      // 1) 서버가 주문을 확정 (금액은 서버가 결정)
      const res = await fetch("/api/payments/create-order", { method: "POST" });
      if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent("/")}`;
        return;
      }
      const order = await res.json();
      if (!res.ok) {
        setError(order.error ?? "주문 생성에 실패했어요.");
        return;
      }

      // 2) 서버가 준 값 그대로 결제창 호출
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: order.customerKey });

      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: order.customerEmail,
      });
      // requestPayment 는 결제창으로 리다이렉트하므로 이 아래는 실행되지 않는다.
    } catch (e) {
      // 사용자가 결제창을 닫은 경우 등
      const msg = e instanceof Error ? e.message : "결제를 시작하지 못했어요.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full rounded-xl bg-[#e0245e] py-3.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "결제창을 여는 중…" : label ?? "프리미엄 리포트 결제하기"}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-[#c01d4f]">{error}</p>
      )}
    </div>
  );
}
