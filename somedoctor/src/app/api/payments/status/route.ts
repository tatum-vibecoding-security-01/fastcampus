import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 프리미엄 해제 여부 확인: 현재 유저에게 승인 완료(DONE)된 주문이 하나라도 있는가.
// 프리미엄 기능을 제공하기 전에 서버에서 이 값을 확인해 게이팅한다.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ premium: false }, { status: 401 });
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "DONE");

  if (error) {
    console.error("[payments] status 조회 실패:", error.message);
    return NextResponse.json({ premium: false }, { status: 500 });
  }

  return NextResponse.json(
    { premium: (count ?? 0) > 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
