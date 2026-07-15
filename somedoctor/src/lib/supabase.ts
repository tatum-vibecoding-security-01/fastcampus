// Supabase 클라이언트 헬퍼
//
// anon(public) 키만 사용합니다. 접근 통제는 전적으로 Supabase의 RLS(Row Level
// Security) 정책에 맡깁니다. anon 키는 공개돼도 안전하며(RLS가 방어선), 브라우저와
// 서버(라우트 핸들러) 양쪽에서 동일하게 사용합니다.
//
// ※ service_role 키는 RLS를 우회하므로 이 프로젝트에서는 사용하지 않습니다.
//
// 필요한 환경변수(.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** anon 키 기반 Supabase 클라이언트 (RLS 적용). 브라우저·서버 공용. */
export function supabaseClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요."
    );
  }
  return createClient(url, anonKey);
}
