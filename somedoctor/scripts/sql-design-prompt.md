# SQL 스키마 설계 프롬프트 (썸닥터 · 원문 비저장)

아래 프롬프트를 Claude/AI에게 그대로 붙여넣어 Supabase SQL 스키마를 설계시킵니다.

---

너는 개인정보 보호를 최우선으로 하는 데이터 엔지니어다. 아래 제약을 반드시 지켜
Supabase(PostgreSQL) 스키마를 설계하라.

## 제품 맥락
- "썸닥터"는 카카오톡 1:1 대화를 분석해 관계 온도·대화 습관·답장 코칭을 제공하는 웹앱이다.
- 파싱과 지표 계산은 전부 브라우저에서 수행되고, 서버로는 익명화된 결과만 전달된다.
- **핵심 원칙: 대화 원문(raw text)은 어떤 형태로도 DB에 저장하지 않는다. 분석 결과(파생 지표 + LLM 해석)만 저장한다.**

## 저장 가능(허용) 데이터
아래는 원문에서 계산된 파생값이거나 사용자에게 이미 노출되는 해석이므로 저장해도 된다.
- 정량 지표(Metrics): 메시지 수/평균 길이/중앙 응답시간(분)/먼저 말 건 횟수/질문 비율/감정표현 비율/대화 기간(일)/총 메시지 수/규칙기반 온도. **모두 숫자·비율값이며 원문 문자열이 아니다.**
- 최종 분석(Analysis): 온도(0~100), headline, signals(title/detail/tone=positive|neutral|caution), summary.
- 나의 대화 습관(SelfPatterns): messageShare/initiationShare/doubleTextRatio/avgBurstLength/lateNightRatio/questionRatio/affectionRatio/replySpeedRatio/myMessageCount (모두 숫자).
- 습관 피드백(PatternFeedback): headline, items(title/observation/suggestion/level=good|watch|caution).
- 답장 코치(ReplyOption): tone(안전형|적극형|위트형), text, rationale.

## 저장 금지(절대 불가) 데이터
- 카톡 메시지 원문 텍스트(KakaoMessage.text), 붙여넣은 대화 전체·발췌(excerpt), 업로드한 .txt 원본.
- 실명/닉네임 등 화자 식별 정보 — 화자는 반드시 `me` / `other` 같은 익명 라벨로만 저장.
- 전화번호·이메일·주소·계정ID 등 대화에 등장할 수 있는 직접 식별자.
- 원문을 역추적·재구성할 수 있는 해시나 인코딩된 사본.

## 주의 항목 (자유서술 필드)
- Analysis.summary / signals.detail, PatternFeedback.items, ReplyOption.text 는 LLM 생성 자유 텍스트라 **원문 문구를 그대로 인용할 위험**이 있다.
- 이 필드를 저장할지 여부를 두 안으로 제시하라: (A) 아예 저장하지 않고 지표만 저장, (B) 저장하되 PII/원문 인용을 막는 방어책(프롬프트 제약 + 저장 전 정규식 마스킹 등)을 함께 명시. 각 안의 트레이드오프를 설명하라.

## 기술 제약
- Supabase 사용. **anon 키만 사용하고 접근 통제는 전적으로 RLS로 한다. service_role 키는 쓰지 않는다.**
- 익명 사용 앱이므로 로그인/개인 계정이 없을 수 있다. 사용자 식별을 어떻게 할지(예: 클라이언트가 생성한 익명 세션 UUID를 PK로) 제안하고, 그에 맞는 RLS 정책을 설계하라.
- 개인정보 없이 익명 통계/튜닝 용도로만 쓰이므로, 필요하면 원본 세션과 분리된 집계 테이블도 고려하라.

## 산출물
1. `CREATE TABLE` DDL (컬럼 주석 포함). 원문 컬럼이 없음을 명시적으로 보여줄 것.
2. RLS 활성화 및 정책(anon 기준 insert/select 규칙).
3. 인덱스·타입 선택 근거(enum은 CHECK 제약 또는 enum 타입 등).
4. 자유서술 필드 저장 여부에 대한 A/B 권고안과 선택 근거.
5. 각 테이블/컬럼이 위 "저장 금지" 원칙을 어떻게 지키는지 1~2줄 검증 요약.

기존 코드의 타입 정의(src/lib/types.ts)와 필드명을 최대한 재사용하라.
