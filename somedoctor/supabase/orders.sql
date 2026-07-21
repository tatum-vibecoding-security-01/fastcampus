-- =============================================================================
-- 썸닥터 · 토스페이먼츠 단건 결제용 orders 테이블 + RLS
-- Supabase SQL Editor 에 그대로 붙여넣어 실행하세요.
-- 멱등(재실행 안전)하게 작성되어 있습니다.
--
-- [보안 모델 요약]
--  - 결제 금액/상태 변경은 "서버 route handler + service_role 키" 로만 수행.
--    service_role 은 RLS 를 우회하므로, 클라이언트(anon/authenticated)는
--    아래 정책상 어떤 쓰기도 할 수 없습니다.
--  - authenticated 유저는 "자기 자신의 주문만 SELECT" 가능.
--  - anon(비로그인)은 접근 불가.
--  - 방어적으로, 혹시 클라이언트 세션 경로로 쓰기가 시도되더라도 막히도록
--    INSERT/UPDATE/DELETE 정책을 아예 만들지 않습니다(RLS 기본 = 거부).
--  - 추가로 CHECK 제약과 트리거로 값 위·변조를 DB 레벨에서 한 번 더 차단.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid        primary key default gen_random_uuid(),
  order_id      text        not null unique,                 -- 토스에 전달한 주문번호(예측 불가 UUID)
  user_id       uuid        not null references auth.users(id) on delete cascade,
  amount        integer     not null,                        -- 서버가 확정한 결제 금액(KRW)
  order_name    text        not null,
  status        text        not null default 'PENDING',      -- PENDING | DONE | FAILED
  payment_key   text,                                        -- 승인 후 저장
  approved_at   timestamptz,
  raw_response  jsonb,                                        -- 토스 승인 응답 요약(민감정보 제외)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 값 위·변조 방어 (DB 레벨 최후 방어선)
  constraint orders_status_chk  check (status in ('PENDING', 'DONE', 'FAILED')),
  constraint orders_amount_chk  check (amount > 0),
  -- DONE 상태는 반드시 payment_key/approved_at 가 채워져 있어야 함
  constraint orders_done_chk    check (
    status <> 'DONE' or (payment_key is not null and approved_at is not null)
  )
);

-- 조회 성능/정책 평가용 인덱스
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_user_status_idx on public.orders (user_id, status);

-- -----------------------------------------------------------------------------
-- 2) updated_at 자동 갱신 트리거
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) 불변 컬럼 보호 트리거 (멱등/위변조 방어, 심층 방어)
--    - order_id / user_id / amount 는 생성 후 절대 변경 불가.
--    - 이미 DONE 인 주문은 어떤 UPDATE 도 거부 (재승인/중복 적립 방지).
--    * service_role 이 실행하더라도 이 트리거는 적용되므로, 서버 버그로 인한
--      금액/소유자 변조나 중복 승인까지 DB 가 막아줍니다.
-- -----------------------------------------------------------------------------
create or replace function public.orders_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'DONE' then
    raise exception 'order % is already DONE and is immutable', old.order_id;
  end if;

  if new.order_id is distinct from old.order_id then
    raise exception 'order_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  if new.amount is distinct from old.amount then
    raise exception 'amount is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_trigger on public.orders;
create trigger orders_guard_trigger
  before update on public.orders
  for each row
  execute function public.orders_guard();

-- -----------------------------------------------------------------------------
-- 4) RLS 활성화
-- -----------------------------------------------------------------------------
alter table public.orders enable row level security;
-- 테이블 소유자(마이그레이션 실행자)도 RLS 를 우회하지 못하도록 강제.
-- service_role 은 BYPASSRLS 속성이라 이 설정과 무관하게 정상 동작합니다.
alter table public.orders force row level security;

-- 재실행 안전을 위해 기존 정책 제거
drop policy if exists "orders_select_own"       on public.orders;
drop policy if exists "orders_no_client_insert" on public.orders;
drop policy if exists "orders_no_client_update" on public.orders;
drop policy if exists "orders_no_client_delete" on public.orders;

-- -----------------------------------------------------------------------------
-- 5) 정책
-- -----------------------------------------------------------------------------

-- (SELECT) 로그인 유저는 "자기 소유" 주문만 조회 가능. anon 은 조회 불가.
create policy "orders_select_own"
  on public.orders
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- (INSERT/UPDATE/DELETE) 클라이언트(anon/authenticated) 쓰기 전면 차단.
--   아래 정책들은 항상 false 라 어떤 행도 통과하지 못합니다.
--   → 주문 생성/상태 변경/금액 확정은 오직 service_role(서버) 만 수행.
--   (RLS 는 기본이 '거부' 이므로 정책을 안 만들어도 막히지만,
--    의도를 명시적으로 남기기 위해 false 정책을 둡니다.)
create policy "orders_no_client_insert"
  on public.orders
  for insert
  to authenticated, anon
  with check ( false );

create policy "orders_no_client_update"
  on public.orders
  for update
  to authenticated, anon
  using ( false )
  with check ( false );

create policy "orders_no_client_delete"
  on public.orders
  for delete
  to authenticated, anon
  using ( false );

-- -----------------------------------------------------------------------------
-- 6) 권한 정리 (선택이지만 권장)
--    anon 에게서 테이블 권한을 거둬 최소권한 원칙 적용.
-- -----------------------------------------------------------------------------
revoke all on public.orders from anon;
grant  select on public.orders to authenticated;   -- 실제 행 노출은 RLS 로 제한됨
-- service_role 은 Supabase 가 기본적으로 모든 권한 + RLS 우회 보유.

-- =============================================================================
-- 참고: 서버(route handler)에서 쓰기용 클라이언트
--   현재 프로젝트는 anon 키 + 쿠키세션만 사용합니다(src/lib/supabase/server.ts).
--   결제 쓰기(create-order, confirm)는 반드시 아래처럼 SERVICE_ROLE 키로
--   별도 클라이언트를 만들어 수행하세요. 이 키는 절대 클라이언트 번들 금지.
--
--   // src/lib/supabase/admin.ts (서버 전용)
--   import { createClient } from "@supabase/supabase-js";
--   export const supabaseAdmin = createClient(
--     process.env.NEXT_PUBLIC_SUPABASE_URL!,
--     process.env.SUPABASE_SERVICE_ROLE_KEY!,   // .env.local, NEXT_PUBLIC_ 금지
--     { auth: { persistSession: false, autoRefreshToken: false } }
--   );
--
--   흐름:
--    1) 유저 검증은 기존 createServerClient(쿠키세션)로 auth.getUser() 수행.
--    2) 검증 통과 후, 그 user.id 를 user_id 로 하여 supabaseAdmin 으로 insert/update.
--       (금액은 서버 상수, status 는 서버 로직으로만 결정)
-- =============================================================================
