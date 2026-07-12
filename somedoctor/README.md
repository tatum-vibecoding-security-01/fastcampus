# 썸닥터 (SomeDoctor)

카카오톡 대화를 분석해 **관계 온도**를 진단하고, **데이터 기반 분석가** 톤으로 답장을 코칭해주는 반응형 웹 앱입니다. (기획서.md 기반 MVP 구현)

- 플랫폼: Next.js(App Router) + TypeScript + Tailwind CSS
- 분석 엔진: 규칙 기반 지표(브라우저 계산) + Claude API(`claude-opus-4-8`) 해석·상담
- 데이터 정책: **비저장** — 대화 원문은 서버 DB에 저장하지 않으며, 파싱·지표 계산은 브라우저에서 수행하고 서버로는 익명화된 지표 + 대화 발췌만 전달합니다.

## 빠른 시작

```bash
cd somedoctor
npm install
cp .env.local.example .env.local   # 그리고 ANTHROPIC_API_KEY 입력
npm run dev
# http://localhost:3000
```

Claude API 키는 https://console.anthropic.com 에서 발급합니다.
현재 세션에서 직접 실행하려면 프롬프트에 다음처럼 입력하세요:

```
! echo "ANTHROPIC_API_KEY=sk-ant-..." > somedoctor/.env.local
```

## 사용 흐름

1. **업로드** — 카카오톡 "대화 내보내기" `.txt` 파일 업로드(또는 붙여넣기). 1:1 대화만 지원.
2. **화자 지정** — 대화 속 "나"를 선택.
3. **진단** — 관계 온도(0~100°) + 핵심 신호 3가지 + 정량 지표 대시보드.
4. **나의 대화 습관** — 대화 점유율·연속 발신·심야 메시지·응답 속도 등 내 습관을 규칙 기반으로 즉시 표시하고, AI가 개선점을 진단.
5. **답장 코치** — 상대의 메시지를 넣으면 안전형·적극형·위트형 답장 3안을 근거와 함께 제안(복사 가능).
6. **상담** — 결과를 바탕으로 채팅으로 자유롭게 질문.

## 프로젝트 구조

```
src/
  app/
    page.tsx              메인 플로우(업로드→화자지정→진단→상담)
    layout.tsx, globals.css
    api/analyze/route.ts  지표+발췌 → Claude 진단(JSON)
    api/coach/route.ts    상대 메시지 → 답장 3안(안전/적극/위트, JSON)
    api/pattern/route.ts  나의 대화 습관 지표 → 습관 피드백(JSON)
    api/chat/route.ts     상담 채팅(스트리밍)
  lib/
    kakaoParser.ts        PC/Android/iOS 내보내기 포맷 파싱
    metrics.ts            규칙 기반 정량 지표 + 온도 산출
    prompts.ts            페르소나/시스템 프롬프트/스키마
    types.ts
  components/
    ResultDashboard.tsx   온도 게이지·신호·지표 카드
    ReplyCoach.tsx        답장 3안 코치(퀵픽·복사)
    PatternFeedback.tsx   나의 대화 습관 진단(자기 지표 + AI 피드백)
    ChatCounselor.tsx     스트리밍 채팅 상담 UI
    TemperatureGauge.tsx  반원 온도 게이지(SVG)
```

## 규칙 기반 온도 산출 (가설 가중치)

`src/lib/metrics.ts`의 `scoreTemperature`에서 계산합니다. 향후 실사용 데이터로 튜닝할 대상입니다.

| 지표 | 가중치 |
|---|---|
| 메시지 양 균형 | 20% |
| 상대의 응답 속도 | 20% |
| 대화 주도권 균형 | 15% |
| 상대의 질문 비율 | 20% |
| 상대의 감정표현 | 15% |
| 감정표현 대칭 | 10% |

이 규칙 기반 온도(baseTemperature)를 Claude가 대화 뉘앙스로 ±15 내에서 보정해 최종 온도를 냅니다.

## 안전 가이드라인

`src/lib/prompts.ts`의 시스템 프롬프트에 명시되어 있습니다: 집착·추적 조언 금지, 위기 신호 시 전문기관 안내(자살예방상담 109), 단정 대신 확률·경향 표현.

## 로드맵(기획서 참고)

- Phase 2: ~~답장 코칭 3안 UI~~ ✅, ~~나의 대화 패턴 피드백~~ ✅, 온도 가중치 튜닝
- Phase 3: 감정 흐름 타임라인, 공유 카드(바이럴), Freemium 결제
