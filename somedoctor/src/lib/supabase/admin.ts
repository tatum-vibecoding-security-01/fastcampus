import "server-only"; // 이 모듈이 클라이언트 번들로 딸려오면 빌드 실패시켜 service role 키 유출을 원천 차단.
import { createClient } from "@supabase/supabase-js";

// 서버 전용 관리자(service role) 클라이언트.
// RLS 를 우회하므로 결제 주문의 생성/상태변경 같은 "서버만 해야 하는" 쓰기에 사용합니다.
// 절대 클라이언트 컴포넌트('use client')에서 import 하지 마세요. NEXT_PUBLIC_ 접두어도 붙이지 않습니다.
//
// orders 테이블은 클라이언트(anon+세션)에게는 select(본인 행)만 허용하고,
// insert/update 는 이 service role 클라이언트로만 수행 → 유저가 결제 없이 status 를 위조할 수 없습니다.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "결제 저장에 필요한 Supabase 환경변수가 없습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 확인하세요."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
