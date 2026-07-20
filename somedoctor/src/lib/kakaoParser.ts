import type { KakaoMessage, ParseResult } from "./types";
import { maskPII } from "./pii";

/**
 * 카카오톡 "대화 내보내기" 텍스트를 구조화한다.
 *
 * 지원 포맷:
 *  1) PC 내보내기
 *     --------------- 2024년 1월 5일 금요일 ---------------
 *     [홍길동] [오전 11:23] 안녕하세요
 *  2) Android 모바일 내보내기
 *     2024년 1월 5일 오후 3:45, 홍길동 : 안녕
 *  3) iOS 모바일 내보내기
 *     2024. 1. 5. 오후 3:45, 홍길동 : 안녕
 *
 * 여러 줄 메시지는 직전 메시지에 이어붙인다.
 * 시스템 메시지(사진/이모티콘/입장·퇴장 등)는 텍스트로 정규화하되 유지한다.
 */

// PC 날짜 구분선: --------------- 2024년 1월 5일 금요일 ---------------
const PC_DATE_LINE =
  /^-{5,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{5,}$/;

// PC 메시지: [홍길동] [오전 11:23] 메시지
const PC_MSG = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/;

// Android: 2024년 1월 5일 오후 3:45, 홍길동 : 메시지
const ANDROID_MSG =
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s?(.*)$/;

// iOS: 2024. 1. 5. 오후 3:45, 홍길동 : 메시지
const IOS_MSG =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s?(.*)$/;

// iOS 24시간 표기: 2024. 1. 5. 15:45, 홍길동 : 메시지
const IOS_MSG_24 =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s?(.*)$/;

function to24Hour(ampm: string, hour: number): number {
  if (ampm === "오전") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function makeTs(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number
): number {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

export function parseKakao(raw: string): ParseResult {
  const lines = raw.split(/\r?\n/);
  const messages: KakaoMessage[] = [];
  const speakerSet = new Map<string, number>(); // speaker -> 첫 등장 순번
  let order = 0;

  // PC 포맷은 날짜가 구분선에만 있으므로 현재 날짜를 추적한다.
  let curYear = 0;
  let curMonth = 0;
  let curDay = 0;

  const pushSpeaker = (s: string) => {
    if (!speakerSet.has(s)) speakerSet.set(s, order++);
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const pcDate = line.match(PC_DATE_LINE);
    if (pcDate) {
      curYear = +pcDate[1];
      curMonth = +pcDate[2];
      curDay = +pcDate[3];
      continue;
    }

    let m: RegExpMatchArray | null;

    // Android
    if ((m = line.match(ANDROID_MSG))) {
      const h = to24Hour(m[4], +m[5]);
      const ts = makeTs(+m[1], +m[2], +m[3], h, +m[6]);
      pushSpeaker(m[7]);
      messages.push({ speaker: m[7], timestamp: ts, text: m[8] ?? "" });
      continue;
    }

    // iOS (오전/오후)
    if ((m = line.match(IOS_MSG))) {
      const h = to24Hour(m[4], +m[5]);
      const ts = makeTs(+m[1], +m[2], +m[3], h, +m[6]);
      pushSpeaker(m[7]);
      messages.push({ speaker: m[7], timestamp: ts, text: m[8] ?? "" });
      continue;
    }

    // iOS (24시간)
    if ((m = line.match(IOS_MSG_24))) {
      const ts = makeTs(+m[1], +m[2], +m[3], +m[4], +m[5]);
      pushSpeaker(m[6]);
      messages.push({ speaker: m[6], timestamp: ts, text: m[7] ?? "" });
      continue;
    }

    // PC
    if ((m = line.match(PC_MSG))) {
      const h = to24Hour(m[2], +m[3]);
      const ts =
        curYear > 0 ? makeTs(curYear, curMonth, curDay, h, +m[4]) : null;
      pushSpeaker(m[1]);
      messages.push({ speaker: m[1], timestamp: ts, text: m[5] ?? "" });
      continue;
    }

    // 어떤 패턴에도 맞지 않으면 직전 메시지의 연속 줄로 간주
    if (messages.length > 0) {
      messages[messages.length - 1].text += "\n" + line;
    }
  }

  const speakers = [...speakerSet.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => s);

  // 파싱된 모든 메시지 본문에서 개인정보(전화번호/계좌번호/이메일 등)를 마스킹한다.
  // 여러 줄 이어붙이기가 끝난 최종 시점에 적용해야 분할된 PII도 잡을 수 있다.
  for (const msg of messages) {
    msg.text = maskPII(msg.text);
  }

  return { messages, speakers, totalLines: lines.length };
}
