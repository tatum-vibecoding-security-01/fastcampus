// 미들웨어에서 Supabase 세션(토큰)을 갱신하는 헬퍼.
//
// 매 요청마다 만료된 액세스 토큰을 리프레시하고, 갱신된 쿠키를 요청과 응답에
// 모두 반영합니다. 이 처리를 하지 않으면 서버 컴포넌트가 오래된 세션을 보게 됩니다.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인해야 접근할 수 있는 경로 접두사. 여기에 경로를 추가하면 전체/부분
// 게이팅을 켤 수 있습니다. (예: "/payment" 를 넣으면 결제 흐름만 보호)
const PROTECTED_PREFIXES: string[] = [
  // "/payment",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() 를 호출해야 토큰이 실제로 갱신됩니다. (getSession 만으로는 부족)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  if (needsAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
