import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버 컴포넌트 / Route Handler 에서 사용하는 Supabase 클라이언트.
// next/headers 의 쿠키 저장소를 통해 세션을 읽고, 필요 시 갱신 쿠키를 기록합니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인하세요."
  );
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
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
          // 서버 컴포넌트에서 호출된 경우 set 이 불가할 수 있음.
          // 세션 갱신은 middleware 가 담당하므로 무시해도 안전합니다.
        }
      },
    },
  });
}

// Route Handler 공용: 로그인한 유저를 반환하고, 없으면 null.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
