# 작업: 토스페이먼츠(일반 결제창) 기반 단건 결제 구현

## 프로젝트 컨텍스트
- Next.js 14 App Router + TypeScript + Tailwind (썸닥터, 카카오톡 대화 분석 앱)
- 인증은 이미 Supabase Auth(`@supabase/ssr`, 쿠키 세션)로 구현됨.
  - `src/lib/supabase/client.ts`(브라우저), `src/lib/supabase/server.ts`(서버/route handler), `middleware.ts`(세션 갱신)
  - route handler에서 `createServerClient` 로 유저 검증하는 패턴이 이미 존재.
- 결제 SDK는 아직 미설치. `@tosspayments/tosspayments-sdk`(v2) 를 새로 설치.
- 환경변수는 `.env.local` 에 자리만 잡혀 있음(테스트 키로 채움):
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY` (클라이언트 키, 결제창 호출용)
  - `TOSS_SECRET_KEY` (시크릿 키, **서버 전용** — 승인 API 인증용, 절대 클라이언트 노출 금지)
- 메인 UI는 `src/app/page.tsx` 의 단일 페이지 스텝 플로우(landing → speaker → loading → result).

## 판매 모델
- **단건 결제 — 프리미엄 리포트**: 1회 결제 시 해당 유저에게 "프리미엄 리포트" 1건이 해제됨.
- 가격은 상수로 서버에 하드코딩(예: `9900원`, KRW). 클라이언트가 보낸 금액을 신뢰하지 않는다.
- 결제 완료 후 프리미엄 기능(심화 분석/코칭 리포트) 접근이 열리도록 게이팅.

## 요구사항
1. **결제 진입/게이팅**
   - 프리미엄 리포트 결제는 **로그인 필수**. 세션이 없으면 `/login?redirect=...` 로 유도.
   - 결제 버튼(예: 결과 화면의 "프리미엄 리포트 결제하기")에서 결제창 호출.

2. **주문 생성(서버, 결제창 호출 전)**
   - 클라이언트가 결제창을 띄우기 전에 `/api/payments/create-order` (POST) 를 먼저 호출.
   - 서버가 `createServerClient` 로 유저 검증 → 미인증 401.
   - 서버가 `orderId`(예측 불가능한 UUID), `amount`(서버 상수), `orderName` 을 **서버에서 확정**하여
     `orders` 테이블에 `status='PENDING'` 으로 저장하고, `orderId`/`amount`/`orderName` 을 응답.
   - 클라이언트는 이 응답값 그대로 결제창에 전달(직접 금액을 만들지 않음).

3. **결제창 호출(클라이언트)**
   - `@tosspayments/tosspayments-sdk` 의 `loadTossPayments(NEXT_PUBLIC_TOSS_CLIENT_KEY)` 사용.
   - `payment = tossPayments.payment({ customerKey })` — `customerKey` 는 유저 식별자(로그인 user id 기반, 예측 불가 값). 비로그인 결제 없음.
   - `payment.requestPayment({ method: 'CARD', amount: { currency: 'KRW', value: <서버가 준 amount> }, orderId, orderName, successUrl: ${origin}/payment/success, failUrl: ${origin}/payment/fail, customerEmail, customerName })`
   - 결제창 취소/실패는 `failUrl` 로 이동.

4. **결제 승인(서버, 가장 중요)**
   - 성공 시 토스가 `successUrl` 로 `paymentKey`, `orderId`, `amount` 쿼리를 붙여 리다이렉트.
   - `/payment/success` 페이지(또는 route)에서 **서버측 승인 API 호출**:
     `POST https://api.tosspayments.com/v1/payments/confirm`
     - 헤더: `Authorization: Basic base64(TOSS_SECRET_KEY + ':')`, `Content-Type: application/json`
     - 바디: `{ paymentKey, orderId, amount }`
   - **승인 전 반드시 서버 검증(핵심 보안 요구사항):**
     - `orderId` 로 `orders` 에서 주문 조회. 존재하지 않으면 거부.
     - 콜백으로 받은 `amount` 가 **DB에 저장된 주문 금액과 정확히 일치**하는지 확인. 불일치 시 승인 호출하지 말고 실패 처리(금액 위·변조 방어).
     - 주문의 `user_id` 가 현재 로그인 유저와 일치하는지 확인.
     - 이미 `status='DONE'` 인 주문이면 재승인하지 않음(멱등/중복 결제 방지).
   - 토스 승인 성공 응답을 받으면 `orders.status='DONE'`, `payment_key`, 승인 시각, 승인 응답 요약을 저장.
   - 승인 실패(토스 4xx/5xx)면 `status='FAILED'` 로 기록하고 사용자에게 실패 안내.

5. **결제 결과 UI**
   - `/payment/success`: 승인 성공 시 완료 메시지 + 프리미엄 리포트로 이동 버튼.
   - `/payment/fail`: 실패 사유(code/message) 안내 + 재시도 링크.
   - 두 페이지 모두 기존 디자인 톤(Tailwind, 한국어)과 일관되게.

6. **프리미엄 해제 확인**
   - 프리미엄 기능/리포트 route handler에서 `createServerClient` 로 유저의 `orders` 중
     `status='DONE'` 결제가 있는지 서버에서 확인 후 제공. 없으면 결제 유도.

## Supabase `orders` 테이블 (SQL + RLS 함께 제시)
- 최소 컬럼(예시):
  - `id uuid pk default gen_random_uuid()`
  - `order_id text unique not null` — 토스에 전달한 주문번호
  - `user_id uuid not null references auth.users(id)`
  - `amount integer not null` — 서버가 확정한 결제 금액(KRW)
  - `order_name text not null`
  - `status text not null default 'PENDING'` — PENDING | DONE | FAILED
  - `payment_key text` — 승인 후 저장
  - `approved_at timestamptz`
  - `created_at timestamptz default now()`
- RLS: 유저는 자기 `user_id` 행만 select 가능. **insert/update 는 서버(서버측 검증 통과)만** 수행하도록 정책 설계.
  (승인/상태 변경은 서버 route handler에서만 일어나야 하며, 클라이언트가 status/amount 를 바꿀 수 없어야 함.)

## 보안 요구사항 (반드시 준수 — 결제 취약점 방어)
- **금액은 서버가 결정하고 서버가 검증한다.** 클라이언트가 보낸 `amount` 를 신뢰하지 말 것.
  승인 직전 `콜백 amount == DB 주문 amount == 서버 상수` 세 값이 일치할 때만 승인 API 호출.
- `TOSS_SECRET_KEY` 는 서버 route handler에서만 사용. 클라이언트 번들/`NEXT_PUBLIC_` 에 절대 포함 금지.
- `orderId` 는 추측 불가능한 값(UUID). 순번/타임스탬프 등 예측 가능한 값 금지.
- 중복 승인 방지(멱등): 이미 `DONE` 인 주문은 재승인·재적립하지 않음.
- 승인 성공 응답의 `orderId`/`amount` 도 서버가 다시 대조(응답 신뢰 전에 재확인).
- 소유권 검증: 주문의 `user_id` == 현재 세션 유저. 타 유저 주문 승인 차단.
- 실패/에러 응답에 시크릿 키·내부 스택 등 민감정보 노출 금지.

## 제약
- 기존 분석 플로우/컴포넌트, Supabase Auth 게이팅 로직을 깨뜨리지 말 것.
- `@tosspayments/tosspayments-sdk` 설치 필요(package.json 추가).
- 테스트 키(`test_ck_...`, `test_sk_...`)로 동작하도록 구현. 실제 정산 없음.
- 새 파일은 기존 구조를 따를 것:
  - `src/app/api/payments/create-order/route.ts` (주문 생성)
  - `src/app/api/payments/confirm/route.ts` 또는 `/payment/success` route handler (승인)
  - `src/app/payment/success/page.tsx`, `src/app/payment/fail/page.tsx`
  - 결제 호출 컴포넌트(예: `src/components/CheckoutButton.tsx`)

## 산출물
1. 변경/신규 파일 목록과 각 역할
2. `orders` 테이블 생성 SQL + RLS 정책 스니펫
3. 필요한 수동 설정 체크리스트(토스 개발자센터 테스트 키 발급/입력, `.env.local` 값)
4. 로컬 테스트 방법: 로그인 → 결제 버튼 → 테스트 카드로 결제 → 승인 → 프리미엄 해제 확인,
   그리고 **금액 위변조 시도(콜백 amount 변조)가 서버에서 거부되는지** 확인하는 절차
