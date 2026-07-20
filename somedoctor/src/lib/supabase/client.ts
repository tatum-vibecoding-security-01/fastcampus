import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 컴포넌트('use client')에서 사용하는 브라우저 Supabase 클라이언트.
// publishable(anon) 키만 사용합니다. 실제 접근 통제는 Supabase RLS 정책으로 처리하세요.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인하세요."
  );
}

export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}
