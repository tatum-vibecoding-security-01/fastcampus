// OAuth(구글·카카오) 로그인과 이메일 확인 링크가 돌아오는 콜백.
//
// Supabase 가 ?code=... 를 붙여 이 경로로 리다이렉트하면, code 를 세션으로
// 교환(PKCE)하고 원래 가려던 곳(또는 홈)으로 보냅니다.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  // 열린 리다이렉트 방지: 같은 사이트 내부 경로만 허용.
  const redirectParam = searchParams.get("redirect") ?? "/";
  const next = redirectParam.startsWith("/") ? redirectParam : "/";

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    );
  }

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("인증 코드가 없습니다.")}`
  );
}
