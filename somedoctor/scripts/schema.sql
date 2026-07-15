-- =============================================================================
-- 썸닥터(SomeDoctor) — 분석 결과 저장 스키마 (Supabase / PostgreSQL)
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여 실행하세요.
-- =============================================================================
-- 데이터 정책: 대화 "원문"은 저장하지 않는다. 브라우저에서 계산된 파생 지표만
-- 저장한다. 화자는 me/other 익명 라벨(_me/_other 접미사)로만 다룬다.
--   → 이 테이블에는 문자열 원문 컬럼이 하나도 없다(전부 숫자/시각/UUID).
--
-- 자유서술 필드 결정: A안 채택.
--   summary / signals.detail / PatternFeedback / ReplyOption.text 같은 LLM 자유
--   텍스트는 원문 문구를 그대로 인용할 위험이 있어 아예 저장하지 않는다.
--   (B안=마스킹 후 저장 예시는 파일 하단 주석 참고)
--
-- 접근 통제: anon 키 + RLS 전용. service_role 키는 사용하지 않는다.
--   - anon 은 INSERT 만 가능(결과 적재). SELECT/UPDATE/DELETE 정책 없음 → 되읽기 불가.
--   - 읽기(분석/튜닝)는 Supabase 대시보드 등 신뢰 경로에서만 수행.
--   → anon 키가 공개돼도 적재된 데이터를 되읽거나 변조할 수 없다.
--
-- 멱등성: create table if not exists / drop policy if exists 로 재실행에 안전.
-- =============================================================================


-- =============================================================================
-- analyses — 분석 1회(세션)당 1행. Metrics + 최종 온도 + SelfPatterns 를 평탄화.
--            모든 컬럼이 숫자/열거 도메인이며 원문 문자열 컬럼이 없다.
-- =============================================================================
create table if not exists analyses (
  id                     uuid        primary key default gen_random_uuid(),

  -- 클라이언트가 생성한 익명 세션 식별자(crypto.randomUUID()). 로그인 없음.
  -- 개인 식별자가 아니라 "같은 브라우저 세션" 결과를 느슨히 묶는 용도.
  client_session_id      uuid        not null,
  created_at             timestamptz not null default now(),

  -- ── Metrics (src/lib/types.ts:Metrics) — 전부 파생 숫자값 ──
  msg_count_me           integer     not null check (msg_count_me      >= 0),
  msg_count_other        integer     not null check (msg_count_other   >= 0),
  avg_len_me             real        not null check (avg_len_me        >= 0),  -- 평균 글자 수
  avg_len_other          real        not null check (avg_len_other     >= 0),
  median_reply_min_me    real                 check (median_reply_min_me    >= 0), -- 중앙 응답(분). 계산불가 시 null
  median_reply_min_other real                 check (median_reply_min_other >= 0),
  initiations_me         integer     not null check (initiations_me    >= 0),  -- 먼저 말 건 횟수
  initiations_other      integer     not null check (initiations_other >= 0),
  question_ratio_me      real        not null check (question_ratio_me    between 0 and 1),
  question_ratio_other   real        not null check (question_ratio_other between 0 and 1),
  affection_ratio_me     real        not null check (affection_ratio_me    between 0 and 1),
  affection_ratio_other  real        not null check (affection_ratio_other between 0 and 1),
  span_days              integer     not null check (span_days      >= 0),  -- 대화가 이어진 총 일수
  total_messages         integer     not null check (total_messages >= 0),  -- 분석에 쓰인 총 메시지 수
  base_temperature       real        not null check (base_temperature between 0 and 100), -- 규칙기반 온도

  -- ── 최종 분석 온도 (src/lib/types.ts:Analysis.temperature) ──
  -- headline/signals/summary(자유텍스트)는 A안에 따라 저장하지 않는다.
  temperature            real        not null check (temperature between 0 and 100),

  -- ── SelfPatterns (src/lib/types.ts:SelfPatterns) — 나의 대화 습관, 전부 숫자 ──
  self_message_share     real        not null check (self_message_share    between 0 and 1),
  self_initiation_share  real        not null check (self_initiation_share between 0 and 1),
  self_double_text_ratio real        not null check (self_double_text_ratio between 0 and 1),
  self_avg_burst_length  real        not null check (self_avg_burst_length >= 0),  -- 연달아 보내는 평균 개수
  self_late_night_ratio  real        not null check (self_late_night_ratio between 0 and 1),
  self_question_ratio    real        not null check (self_question_ratio  between 0 and 1),
  self_affection_ratio   real        not null check (self_affection_ratio between 0 and 1),
  -- 응답속도 비율 = 내 중앙값 / 상대 중앙값. 1보다 크면 내가 더 느림. 계산불가 시 null.
  self_reply_speed_ratio real                 check (self_reply_speed_ratio >= 0),
  self_my_message_count  integer     not null check (self_my_message_count >= 0)
);

comment on table  analyses is '분석 세션 1회당 1행. 파생 숫자 지표만 저장하며 대화 원문/식별자는 저장하지 않는다.';
comment on column analyses.client_session_id is '클라이언트 생성 익명 세션 UUID. 로그인 식별자 아님.';

-- 조회/튜닝용 인덱스(읽기는 신뢰 경로에서만).
create index if not exists analyses_created_at_idx  on analyses (created_at);
create index if not exists analyses_session_idx     on analyses (client_session_id);


-- =============================================================================
-- RLS — anon 은 INSERT 만. 읽기/수정/삭제 정책은 두지 않는다.
-- =============================================================================
alter table analyses enable row level security;

drop policy if exists "anon can insert analyses" on analyses;
create policy "anon can insert analyses"
  on analyses
  for insert
  to anon
  with check (true);
-- SELECT/UPDATE/DELETE policy 없음 → anon 은 적재만 가능, 되읽기·변조 불가.


-- =============================================================================
-- 검증(선택): 실행 후 아래 주석을 풀어 스키마/RLS 를 확인.
-- =============================================================================
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'analyses' order by ordinal_position;
--
-- select relrowsecurity as rls_enabled from pg_class where relname = 'analyses';
--
-- select policyname, cmd, roles from pg_policies where tablename = 'analyses';


-- =============================================================================
-- [선택 확장 · B안] 카테고리형(enum) 값을 저장하고 싶을 때만 아래 주석을 해제.
-- 주의: enum tone/level 은 카테고리라 원문 인용 위험이 낮지만, 자유텍스트
--       (detail/summary/reply text)를 함께 저장하려면 반드시 저장 전에 PII/원문
--       마스킹을 거쳐야 한다. 그렇지 않으면 원문 비저장 원칙이 깨진다.
-- =============================================================================
-- do $$ begin
--   create type signal_tone   as enum ('positive', 'neutral', 'caution');
-- exception when duplicate_object then null; end $$;
-- do $$ begin
--   create type feedback_level as enum ('good', 'watch', 'caution');
-- exception when duplicate_object then null; end $$;
-- do $$ begin
--   create type reply_tone     as enum ('안전형', '적극형', '위트형');
-- exception when duplicate_object then null; end $$;
--
-- 예) signals 3개의 tone 만(제목/detail 텍스트 제외) 저장:
-- alter table analyses
--   add column if not exists signal_1_tone signal_tone,
--   add column if not exists signal_2_tone signal_tone,
--   add column if not exists signal_3_tone signal_tone;
