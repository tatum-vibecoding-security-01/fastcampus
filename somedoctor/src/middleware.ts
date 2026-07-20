import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 세션 쿠키 갱신만 수행. 전면 게이팅은 하지 않음.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 정적 자원/이미지 등을 제외한 모든 경로에서 세션 갱신
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
