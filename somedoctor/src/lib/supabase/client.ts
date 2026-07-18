// 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
//
// @supabase/ssr 의 createBrowserClient 는 세션을 쿠키에 저장하므로,
// 서버 컴포넌트·라우트 핸들러·미들웨어와 세션을 공유할 수 있습니다.
// anon(publishable) 키만 사용하며 접근 통제는 RLS 정책에 맡깁니다.

import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 브라우저용 Supabase 클라이언트 (쿠키 세션 · RLS 적용). */
export function createSupabaseBrowserClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요."
    );
  }
  return createBrowserClient(url, anonKey);
}
