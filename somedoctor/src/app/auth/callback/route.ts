import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OAuth(카카오) 및 이메일 인증 링크의 리다이렉트를 처리한다.
// code 를 세션으로 교환한 뒤 원래 가려던 곳(next)으로 보낸다.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 실패 시 로그인 페이지로 안내
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("로그인 처리에 실패했어요. 다시 시도해 주세요.")}`
  );
}
