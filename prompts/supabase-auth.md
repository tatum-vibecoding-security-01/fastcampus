# 작업: Supabase Auth 기반 로그인/회원가입 구현

## 프로젝트 컨텍스트
- Next.js 14 App Router + TypeScript + Tailwind (썸닥터, 카카오톡 대화 분석 앱)
- Supabase는 이미 설치됨(@supabase/supabase-js). 현재 `src/lib/supabase.ts` 는 anon 키로
  브라우저 클라이언트만 생성. 접근 통제는 RLS로 처리하는 방침.
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local` 에 존재)
- 메인 UI는 `src/app/page.tsx` 의 단일 페이지 스텝 플로우
  (landing → speaker → loading → result). '분석하기' 실행 시 `/api/analyze` 호출.

## 요구사항
1. 인증 방식: (a) 이메일 + 비밀번호, (b) 카카오 소셜 로그인 두 가지 지원
2. 세션 관리: `@supabase/ssr` 쿠키 기반으로 전환
   - `src/lib/supabase` 를 server/browser 클라이언트로 분리
   - `createBrowserClient` (클라이언트 컴포넌트용)
   - `createServerClient` (서버 컴포넌트/route handler용, `next/headers` cookies 사용)
   - `middleware.ts` 로 세션 토큰 갱신(refresh) 처리
3. UI: 별도 페이지 `/login` 과 `/signup` (Tailwind, 한국어, 기존 디자인 톤과 일관되게)
   - 이메일/비번 폼 + "카카오로 계속하기" 버튼
   - OAuth 콜백 처리용 `/auth/callback` route handler
   - 로그아웃 기능 + 헤더/랜딩에 로그인 상태 표시(로그인 시 이메일/로그아웃 버튼)
4. 접근 통제 범위: **분석 실행 시점에만 로그인 요구**
   - 랜딩, 파일 업로드, 화자 선택까지는 비로그인 허용
   - '분석하기'를 누를 때 세션이 없으면 `/login` 으로 리다이렉트
     (`?redirect=현재상태` 또는 로그인 후 복귀 처리)
   - 서버측 방어: `/api/analyze` 및 `/api/coach`, `/api/chat`, `/api/pattern` route handler에서
     `createServerClient` 로 유저 검증, 미인증이면 401 반환
   - middleware 는 전체 차단이 아니라 세션 새로고침만 담당(전면 게이팅 X)

## 카카오 OAuth 참고
- Supabase 대시보드 > Authentication > Providers > Kakao 활성화 필요(별도 안내로 명시)
- `signInWithOAuth({ provider: 'kakao', options: { redirectTo: `${origin}/auth/callback` }})`
- `/auth/callback` 에서 `exchangeCodeForSession` 처리 후 홈으로 리다이렉트

## 제약
- 기존 분석 플로우/컴포넌트를 깨뜨리지 말 것. `page.tsx` 의 스텝 로직은 유지하고 게이팅만 추가.
- `@supabase/ssr` 패키지 설치 필요(package.json 에 추가).
- 서비스롤 키는 클라이언트 번들에 절대 노출 금지. anon 키만 `NEXT_PUBLIC_` 사용.
- 새 DB 테이블/컬럼이 필요하면(예: 프로필) SQL 스니펫과 RLS 정책도 함께 제시.
- 완료 후 변경 파일 목록과 남은 수동 설정(카카오 Provider, 리다이렉트 URL 등록)을 요약.

## 산출물
1. 변경/신규 파일 목록과 각 역할
2. 필요한 Supabase 대시보드 수동 설정 체크리스트
3. 로컬 테스트 방법(이메일 가입 → 로그인 → 분석 게이팅 확인)
