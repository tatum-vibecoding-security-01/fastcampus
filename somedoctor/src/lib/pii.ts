// 개인정보(PII) 마스킹 보안 모듈
//
// 파싱된 대화 데이터가 지표 계산·LLM 프롬프트·서버로 흘러가기 전에
// 전화번호/계좌번호/이메일 등 민감정보를 라벨로 치환한다.
//
// ┌─ 규칙 추가 방법 ────────────────────────────────────────────────┐
// │ 새 PII 유형을 마스킹하려면 아래 PII_RULES 배열에 항목 하나만    │
// │ 추가하면 된다. maskPII()가 배열 순서대로 규칙을 적용한다.        │
// │ - pattern 은 반드시 전역 플래그(g)를 포함해야 한다.             │
// │ - 순서가 중요하다: 더 구체적인 규칙(이메일·전화번호)을          │
// │   더 포괄적인 규칙(계좌번호)보다 먼저 둔다.                     │
// └────────────────────────────────────────────────────────────────┘

/** 하나의 PII 마스킹 규칙 */
export interface PiiRule {
  /** 규칙 식별용 이름 (로깅/디버깅용) */
  name: string;
  /** 매칭된 문자열을 대체할 라벨 */
  label: string;
  /** 매칭 정규식 (전역 플래그 g 필수) */
  pattern: RegExp;
  /** 규칙 설명 */
  description: string;
}

/**
 * 마스킹 규칙 모음. 차후 규칙은 여기에 추가한다.
 *
 * 적용 순서 주의:
 *  1) 이메일  — @ 를 포함하므로 숫자 규칙과 충돌 없음. 가장 먼저.
 *  2) 전화번호 — 계좌번호보다 먼저 처리해야 전화번호가 계좌로 오인되지 않음.
 *  3) 계좌번호 — 남은 숫자 그룹을 포괄적으로 잡는다. 가장 나중.
 */
export const PII_RULES: PiiRule[] = [
  {
    name: "email",
    label: "[이메일]",
    description: "이메일 주소 (예: user@example.com)",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    name: "phone",
    label: "[전화번호]",
    description:
      "휴대전화(010-1234-5678, 01012345678) 및 지역번호 유선전화(02-123-4567)",
    // 010/011/016~019 휴대전화, 0XX 지역번호 유선전화 모두 커버.
    // 구분자는 하이픈/점/공백 허용 또는 없음.
    pattern:
      /(?<![0-9])0(?:1[016-9]|2|[3-6][1-5]|70)[-.\s]?\d{3,4}[-.\s]?\d{4}(?![0-9])/g,
  },
  {
    name: "account",
    label: "[계좌번호]",
    description:
      "은행 계좌번호. 하이픈으로 구분된 숫자 그룹(110-123-456789) 또는 10~14자리 연속 숫자",
    // 하이픈으로 구분된 3그룹 이상, 또는 구분자 없는 10~14자리 숫자.
    pattern:
      /(?<![0-9-])(?:\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,6})?|\d{10,14})(?![0-9-])/g,
  },
];

/**
 * 단일 문자열에서 PII를 마스킹한다.
 * 등록된 모든 규칙을 순서대로 적용한다.
 */
export function maskPII(text: string, rules: PiiRule[] = PII_RULES): string {
  if (!text) return text;
  let out = text;
  for (const rule of rules) {
    out = out.replace(rule.pattern, rule.label);
  }
  return out;
}

/**
 * text 필드를 가진 객체 배열의 각 text를 마스킹한 새 배열을 반환한다.
 * (원본은 변경하지 않는다.)
 */
export function maskMessages<T extends { text: string }>(
  items: T[],
  rules: PiiRule[] = PII_RULES
): T[] {
  return items.map((item) => ({ ...item, text: maskPII(item.text, rules) }));
}
