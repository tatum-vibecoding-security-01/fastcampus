// 서버(서버 컴포넌트·라우트 핸들러)용 Supabase 클라이언트.
//
// next/headers 의 cookies() 를 통해 요청/응답 쿠키를 읽고 쓰며, 이를 통해
// 미들웨어에서 갱신된 세션을 서버에서도 그대로 사용합니다.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 서버용 Supabase 클라이언트 (쿠키 세션 · RLS 적용). */
export function createSupabaseServerClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요."
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // 서버 컴포넌트에서 호출되면 set 이 막힐 수 있습니다. 세션 갱신은
          // 미들웨어가 담당하므로 이 경우는 무시해도 안전합니다.
        }
      },
    },
  });
}
