import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREMIUM_PRODUCT } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 결제창을 띄우기 전에 서버가 주문을 확정한다.
// orderId(추측 불가 UUID)와 amount(서버 상수)를 서버가 정하고 PENDING 으로 저장한 뒤 반환.
// 클라이언트는 이 값을 그대로 결제창에 전달할 뿐, 금액을 스스로 만들지 않는다.
export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 이미 프리미엄을 보유(결제 완료)한 유저면 새 주문을 만들지 않는다.
  // 단건 상품이므로 재구매를 막아 중복결제를 방지한다.
  const { data: existingDone, error: dupErr } = await admin
    .from("orders")
    .select("order_id")
    .eq("user_id", user.id)
    .eq("status", "DONE")
    .limit(1)
    .maybeSingle<{ order_id: string }>();

  if (dupErr) {
    console.error("[payments] create-order 중복 확인 실패:", dupErr.message);
    return NextResponse.json(
      { error: "주문 생성에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
  if (existingDone) {
    return NextResponse.json(
      { error: "이미 프리미엄 리포트를 보유하고 있어요.", alreadyOwned: true },
      { status: 409 }
    );
  }

  const orderId = randomUUID();

  const { error } = await admin.from("orders").insert({
    order_id: orderId,
    user_id: user.id,
    amount: PREMIUM_PRODUCT.amount,
    order_name: PREMIUM_PRODUCT.orderName,
    status: "PENDING",
  });

  if (error) {
    console.error("[payments] create-order insert 실패:", error.message);
    return NextResponse.json(
      { error: "주문 생성에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      orderId,
      amount: PREMIUM_PRODUCT.amount,
      orderName: PREMIUM_PRODUCT.orderName,
      // customerKey: 토스가 요구하는 고객 식별자. 로그인 유저 id 사용.
      customerKey: user.id,
      customerEmail: user.email ?? undefined,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
