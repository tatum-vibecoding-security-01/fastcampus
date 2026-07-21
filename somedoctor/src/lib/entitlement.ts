import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

// 접근 통제 공용 헬퍼.
// 인가 검증이 라우트마다 누락/중복되지 않도록, 로그인/이용권 검증을 한 곳으로 모은다.
// 반환값은 "성공(user 포함)" 또는 "실패(error+status)" 둘 중 하나이므로,
// 각 route handler 진입부에서 결과를 그대로 응답으로 돌려주면 된다.

export type GateResult =
  | { ok: true; user: User }
  | { ok: false; error: string; status: 401 | 403 | 500 };

/** 로그인만 요구한다. 세션이 없으면 401. */
export async function requireAuth(): Promise<GateResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "로그인이 필요해요.", status: 401 };
  }
  return { ok: true, user };
}

/**
 * 로그인 + 이용권(프리미엄) 보유를 요구한다.
 *  - 세션 없음 → 401
 *  - 이용권(orders.status='DONE') 없음 → 403
 * 이용권 판별은 클라이언트가 보낸 값이 아니라, service_role 로 DB 를 직접 조회해
 * 결정한다(=클라이언트가 우회/위조 불가). 실제 프리미엄 기능 라우트는 UI 게이팅이나
 * /api/payments/status 응답에 의존하지 말고 반드시 이 함수로 서버에서 검증할 것.
 */
export async function requirePremium(): Promise<GateResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "로그인이 필요해요.", status: 401 };
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "DONE");

  if (error) {
    console.error("[entitlement] 이용권 조회 실패:", error.message);
    return {
      ok: false,
      error: "이용권 확인 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      status: 500,
    };
  }

  if (!count || count < 1) {
    return {
      ok: false,
      error: "프리미엄 이용권이 필요한 기능이에요.",
      status: 403,
    };
  }

  return { ok: true, user };
}
