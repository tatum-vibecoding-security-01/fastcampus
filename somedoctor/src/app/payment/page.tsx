"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadTossPayments,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";

// 문서 공개 테스트용 상품. 금액의 진실은 서버(src/lib/toss.ts)에 있고,
// 여기 값은 위젯에 표시·요청하는 용도일 뿐 승인 시 서버가 다시 검증한다.
const PRODUCT = { id: "deep_report", name: "썸닥터 심층 분석 리포트", amount: 4900 };

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

// 비회원(익명) 결제용 customerKey. 회원 서비스라면 사용자 고유 식별자를 쓴다.
function anonymousCustomerKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "guest_" + Math.abs(Date.now()).toString(36);
}

export default function PaymentPage() {
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerKeyRef = useRef<string>("");
  // StrictMode(dev)에서 useEffect가 두 번 실행돼 위젯이 같은 DOM에 이중 렌더링되면
  // SDK가 멈춘다. 초기화를 정확히 1회만 하도록 가드한다.
  const initedRef = useRef(false);

  // 1) SDK 로드 → 위젯 생성 → 금액 설정 → 결제수단/약관 렌더.
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    (async () => {
      try {
        if (!CLIENT_KEY) throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
        customerKeyRef.current = anonymousCustomerKey();
        const tossPayments = await loadTossPayments(CLIENT_KEY);
        const w = tossPayments.widgets({ customerKey: customerKeyRef.current });
        await w.setAmount({ currency: "KRW", value: PRODUCT.amount });
        await Promise.all([
          w.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
          w.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
        ]);
        setWidgets(w);
        setReady(true);
      } catch (e) {
        // 실패 시 재시도할 수 있도록 가드를 풀어준다.
        initedRef.current = false;
        setError(e instanceof Error ? e.message : "결제 위젯을 불러오지 못했습니다.");
      }
    })();
  }, []);

  // 2) 결제 요청 → 인증 후 successUrl/failUrl로 리다이렉트.
  async function handlePay() {
    if (!widgets) return;
    setError(null);
    // orderId: 6~64자 고유값. 상품 조회를 위해 productId를 successUrl 쿼리에 실어 보낸다.
    const orderId = `order_${PRODUCT.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const origin = window.location.origin;
    try {
      await widgets.requestPayment({
        orderId,
        orderName: PRODUCT.name,
        successUrl: `${origin}/payment/success?productId=${PRODUCT.id}`,
        failUrl: `${origin}/payment/fail`,
        customerName: "테스트 고객",
      });
    } catch (e) {
      // 사용자가 결제창을 닫는 등 클라이언트 단 실패.
      setError(e instanceof Error ? e.message : "결제를 진행하지 못했습니다.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-10">
      <header className="space-y-1">
        <p className="text-xs font-medium text-[#2e9e5b]">토스페이먼츠 테스트 결제</p>
        <h1 className="text-2xl font-bold">{PRODUCT.name}</h1>
        <p className="text-sm text-ink/60">
          문서 공개 테스트 키로 동작합니다. 실제 결제는 발생하지 않아요.
        </p>
      </header>

      <div className="rounded-2xl border border-ink/10 bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink/70">결제 금액</span>
          <span className="text-lg font-bold">{PRODUCT.amount.toLocaleString()}원</span>
        </div>
      </div>

      {/* 결제수단 위젯 */}
      <div id="payment-method" />
      {/* 이용약관 동의 위젯 */}
      <div id="agreement" />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={!ready}
        className="rounded-2xl bg-[#2e9e5b] px-5 py-4 text-base font-bold text-white transition disabled:opacity-40"
      >
        {ready ? `${PRODUCT.amount.toLocaleString()}원 결제하기` : "결제창 불러오는 중…"}
      </button>

      <p className="text-center text-xs text-ink/40">
        테스트 카드 결제는 실제 승인되지 않으며, 승인 응답만 확인할 수 있어요.
      </p>
    </main>
  );
}
