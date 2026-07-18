import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 매 요청마다 Supabase 세션을 갱신합니다.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // 정적 자산·이미지 요청은 제외하고 실행합니다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
