import { NextRequest, NextResponse } from "next/server";
import { TOSS_CONFIRM_URL, getProduct, tossAuthHeader } from "@/lib/toss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 결제 승인(confirm). 결제창에서 인증이 끝나면 successUrl로 paymentKey/orderId/amount가
 * 돌아오고, 이 라우트가 토스 승인 API를 호출해 실제 결제를 확정한다.
 *
 * 보안: 승인 전에 productId로 서버 카탈로그 금액과 대조한다. 클라이언트가 조작한
 * amount(금액 변조)로는 승인이 진행되지 않는다.
 */
export async function POST(req: NextRequest) {
  let body: { paymentKey?: string; orderId?: string; amount?: number; productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { paymentKey, orderId, amount, productId } = body;

  if (!paymentKey || !orderId || typeof amount !== "number" || !productId) {
    return NextResponse.json(
      { message: "paymentKey, orderId, amount, productId가 필요합니다." },
      { status: 400 }
    );
  }

  // 금액 검증: 진실은 서버에 있다.
  const product = getProduct(productId);
  if (!product) {
    return NextResponse.json({ message: "알 수 없는 상품입니다." }, { status: 400 });
  }
  if (product.amount !== amount) {
    return NextResponse.json(
      { message: "결제 금액이 상품 금액과 일치하지 않습니다." },
      { status: 400 }
    );
  }

  // 토스 승인 API 호출.
  const res = await fetch(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: {
      Authorization: tossAuthHeader(),
      "Content-Type": "application/json",
      // 멱등성: 같은 orderId로 중복 승인 요청이 와도 이중 결제되지 않게 한다.
      "Idempotency-Key": orderId,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const data = await res.json();

  if (!res.ok) {
    // 토스가 내려준 에러(code, message)를 그대로 전달.
    return NextResponse.json(
      { message: data?.message ?? "결제 승인에 실패했습니다.", code: data?.code },
      { status: res.status }
    );
  }

  // 성공: 실제 서비스라면 여기서 주문을 '결제완료'로 기록하고 상품 접근권을 부여한다.
  return NextResponse.json({
    orderId: data.orderId,
    orderName: data.orderName,
    amount: data.totalAmount,
    method: data.method,
    approvedAt: data.approvedAt,
    receiptUrl: data.receipt?.url ?? null,
  });
}
