// 공용 타입 정의

export interface KakaoMessage {
  speaker: string;
  /** epoch milliseconds, 파싱 실패 시 null */
  timestamp: number | null;
  text: string;
}

export interface ParseResult {
  messages: KakaoMessage[];
  /** 등장 순서대로의 화자 목록 */
  speakers: string[];
  totalLines: number;
}

/** 규칙 기반으로 계산한 정량 지표 */
export interface Metrics {
  me: string;
  other: string;
  messageCount: { me: number; other: number };
  avgLength: { me: number; other: number };
  /** 중앙값 응답 시간(분). 상대가 나에게 답하는 속도 / 내가 상대에게 답하는 속도 */
  medianReplyMinutes: { me: number | null; other: number | null };
  /** 먼저 말을 건 횟수 (대화 공백 이후 첫 메시지) */
  initiations: { me: number; other: number };
  /** 질문 비율 (물음표 포함 메시지 / 전체 메시지) */
  questionRatio: { me: number; other: number };
  /** 감정표현(이모티콘/ㅋㅋ/ㅎㅎ/ㅠㅠ/하트 등) 비율 */
  affectionRatio: { me: number; other: number };
  /** 대화가 이어진 총 일수 */
  spanDays: number;
  /** 분석에 사용된 총 메시지 수 */
  totalMessages: number;
  /** 규칙 기반 온도 (0~100), LLM 보정 전 */
  baseTemperature: number;
}

/** LLM이 반환하는 분석 결과 스키마 */
export interface Analysis {
  /** 최종 관계 온도 0~100 */
  temperature: number;
  /** 한 줄 요약 */
  headline: string;
  /** 핵심 신호 3가지 */
  signals: {
    title: string;
    detail: string;
    tone: "positive" | "neutral" | "caution";
  }[];
  /** 데이터 기반 분석가 톤의 종합 소견 (2~4문장) */
  summary: string;
}

export interface AnalyzeResponse {
  metrics: Metrics;
  analysis: Analysis;
}

/** 답장 코치가 제안하는 답장 1안 */
export interface ReplyOption {
  tone: "안전형" | "적극형" | "위트형";
  text: string;
  rationale: string;
}

/** 규칙 기반으로 계산한 "나"의 대화 습관 지표 */
export interface SelfPatterns {
  /** 내 메시지 비율 (내 메시지 / 전체) */
  messageShare: number;
  /** 내가 먼저 말 건 비율 */
  initiationShare: number;
  /** 연속 발신 비율: 상대 답장 없이 내가 추가로 보낸 메시지 / 내 메시지 */
  doubleTextRatio: number;
  /** 한 번에 연달아 보내는 평균 메시지 수 */
  avgBurstLength: number;
  /** 내 메시지 중 심야(0~5시) 비율 */
  lateNightRatio: number;
  /** 내 질문 비율 */
  questionRatio: number;
  /** 내 감정표현 비율 */
  affectionRatio: number;
  /**
   * 응답 속도 비율 = 내 응답 중앙값 / 상대 응답 중앙값.
   * 1보다 작을수록 내가 상대보다 훨씬 빨리 답한다는 뜻. 계산 불가 시 null.
   */
  replySpeedRatio: number | null;
  /** 계산에 쓰인 내 메시지 수 */
  myMessageCount: number;
}

/** LLM이 반환하는 대화 습관 피드백 */
export interface PatternFeedback {
  headline: string;
  items: {
    title: string;
    observation: string;
    suggestion: string;
    level: "good" | "watch" | "caution";
  }[];
}
