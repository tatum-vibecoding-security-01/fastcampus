import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PREMIUM_PRODUCT,
  TOSS_CONFIRM_URL,
  tossAuthHeader,
  type OrderRow,
} from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 결제 승인(서버). 가장 중요한 보안 지점.
// 토스에 승인 요청을 보내기 "전"에 다음을 모두 검증한다:
//  1) 주문이 존재하는가 (orderId → DB)
//  2) 주문 소유자가 현재 로그인 유저인가
//  3) 콜백 amount == DB 주문 amount == 서버 상수 (세 값이 모두 일치)  ← 금액 위·변조 방어
//  4) 이미 승인(DONE)된 주문이 아닌가 (중복 승인/멱등)
// 검증을 모두 통과한 경우에만 토스 승인 API 를 호출한다.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    // 내부 환경변수 이름은 서버 로그로만 남기고, 클라이언트에는 일반 메시지만 반환한다.
    console.error("[payments] TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.");
    return NextResponse.json(
      { error: "결제 설정 오류입니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return NextResponse.json(
      { error: "결제 정보가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1) 주문 조회
  const { data: order, error: selErr } = await admin
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle<OrderRow>();

  if (selErr) {
    console.error("[payments] confirm select 실패:", selErr.message);
    return NextResponse.json({ error: "주문 조회에 실패했어요." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json(
      { error: "존재하지 않는 주문입니다." },
      { status: 404 }
    );
  }

  // 2) 소유권 검증: 타 유저의 주문을 승인할 수 없다.
  if (order.user_id !== user.id) {
    return NextResponse.json({ error: "권한이 없는 주문입니다." }, { status: 403 });
  }

  // 4) 멱등: 이미 승인된 주문이면 재승인하지 않고 성공으로 응답.
  if (order.status === "DONE") {
    return NextResponse.json({ ok: true, alreadyDone: true, orderName: order.order_name });
  }

  // 3) 금액 위·변조 방어: 콜백 amount == DB amount == 서버 상수 세 값이 모두 일치해야 한다.
  if (amount !== order.amount || order.amount !== PREMIUM_PRODUCT.amount) {
    console.warn(
      `[payments] 금액 불일치 감지 order=${orderId} callback=${amount} db=${order.amount} expected=${PREMIUM_PRODUCT.amount}`
    );
    await admin
      .from("orders")
      .update({ status: "FAILED" })
      .eq("order_id", orderId)
      .eq("status", "PENDING");
    return NextResponse.json(
      { error: "결제 금액이 일치하지 않아 승인을 중단했어요." },
      { status: 400 }
    );
  }

  // 검증 통과 → 토스 승인 API 호출
  let tossData: Record<string, unknown>;
  try {
    const res = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: tossAuthHeader(secretKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    tossData = await res.json();

    if (!res.ok) {
      const message =
        (typeof tossData?.message === "string" && tossData.message) ||
        "결제 승인에 실패했어요.";
      // PENDING 일 때만 FAILED 로 전이. 경합 상황에서 다른 요청이 이미 DONE 처리한
      // 주문을 FAILED 로 덮어쓰지 않도록 방어한다(결제됐는데 미해제되는 상태 꼬임 방지).
      await admin
        .from("orders")
        .update({ status: "FAILED" })
        .eq("order_id", orderId)
        .eq("status", "PENDING");
      return NextResponse.json({ error: message }, { status: 402 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[payments] 토스 승인 호출 실패:", msg);
    return NextResponse.json(
      { error: "결제 승인 중 오류가 발생했어요." },
      { status: 502 }
    );
  }

  // 승인 응답도 서버가 다시 대조 (응답을 신뢰하기 전에 재확인)
  if (tossData.orderId !== orderId || tossData.totalAmount !== order.amount) {
    console.warn(
      `[payments] 승인 응답 불일치 order=${orderId} resp=${JSON.stringify({
        orderId: tossData.orderId,
        totalAmount: tossData.totalAmount,
      })}`
    );
    return NextResponse.json(
      { error: "승인 응답 검증에 실패했어요. 고객센터에 문의해 주세요." },
      { status: 502 }
    );
  }

  // DONE 처리
  const { error: updErr } = await admin
    .from("orders")
    .update({
      status: "DONE",
      payment_key: paymentKey,
      approved_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("status", "PENDING"); // 경합 상황에서 PENDING 일 때만 갱신 (이중 처리 방지)

  if (updErr) {
    console.error("[payments] confirm update 실패:", updErr.message);
    // 승인은 됐으나 기록 실패. 재조회 시 이미 DONE 이 아닐 수 있어 로그로 남긴다.
  }

  return NextResponse.json(
    { ok: true, orderName: order.order_name, amount: order.amount },
    { headers: { "Cache-Control": "no-store" } }
  );
}
