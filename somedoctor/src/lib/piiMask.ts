// 개인정보(PII) 마스킹 — 파서와 저장(DB) 사이에 끼우는 보안 계층.
//
// 설계 원칙
//  - 파싱 로직/DB 스키마는 건드리지 않는다. 이 모듈은 "구조화된 메시지"를 받아
//    "마스킹된 메시지"를 돌려주는 순수 함수만 노출한다(원본 불변).
//  - 마스킹 전 원문은 반환 객체에 남기지 않고, 로그에도 절대 남기지 않는다.
//  - 새 유형(주민번호·카드번호 등)은 piiPatterns()의 배열에 한 줄만 추가하면 된다.

import type { KakaoMessage } from "./types";

export interface PiiPattern {
  /** 규칙 식별용 이름(디버깅/테스트용, 로그에 원문은 남기지 않음) */
  name: string;
  /** 전역(g) 플래그 정규식 */
  regex: RegExp;
  /** 매치를 대체할 문자열 */
  replacement: string;
}

/**
 * 마스킹 규칙 레지스트리.
 *
 * 적용 순서 = 배열 순서. 이메일 → 전화 → 계좌 순으로 둔다.
 *  - 좁게 잡히는 규칙(이메일·전화)을 먼저 적용하고,
 *  - 넓게 잡히는 규칙(계좌)을 뒤에 둬서 오탐을 줄인다.
 *  - 계좌 규칙은 전화 마스킹 이후에 돌기 때문에, 전화 대체문(010-0000-0000)을
 *    다시 잡지 않도록 "010-"으로 시작하는 묶음은 제외한다.
 *
 * 구분자로는 하이픈/점/공백만 허용하고 개행(\n, \t)은 제외한다.
 * (여러 줄 메시지에서 줄바꿈을 사이에 두고 잘못 이어붙는 것을 방지)
 */
export function piiPatterns(): PiiPattern[] {
  return [
    {
      name: "email",
      regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      replacement: "이메일",
    },
    {
      name: "phone",
      // 한국 휴대폰: 010/011/016/017/018/019, 구분자(-, ., 공백) 선택.
      regex: /01[016789][-. ]?\d{3,4}[-. ]?\d{4}/g,
      replacement: "010-0000-0000",
    },
    {
      name: "account",
      // 계좌번호: 하이픈/점/공백으로 끊긴 숫자 묶음 3개 이상(각 2~6자리).
      // "010-"으로 시작하는 묶음(전화 대체문 포함)은 제외한다.
      regex: /\b(?!010[-. ])\d{2,6}[-. ]\d{2,6}[-. ]\d{2,6}\b/g,
      replacement: "계좌번호",
    },
  ];
}

/**
 * 문자열 하나에 모든 마스킹 규칙을 순서대로 적용한다. 순수 함수(원본 불변).
 * piiPatterns()가 매 호출마다 새 정규식을 만들므로 lastIndex 공유 문제는 없다.
 */
export function maskText(text: string): string {
  let out = text;
  for (const { regex, replacement } of piiPatterns()) {
    out = out.replace(regex, replacement);
  }
  return out;
}

/**
 * 파싱 결과의 개인정보를 마스킹한다. 파서(구조화)와 저장(DB) 사이의 보안 계층.
 * 각 메시지의 text만 마스킹본으로 교체하고, 원문 text는 반환 객체에 남기지 않는다.
 */
export function maskMessages(messages: KakaoMessage[]): KakaoMessage[] {
  return messages.map((m) => ({ ...m, text: maskText(m.text) }));
}
