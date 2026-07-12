import type { KakaoMessage, Metrics, SelfPatterns } from "./types";

// 대화 공백 기준 (분): 이 시간 이상 끊기면 새로운 대화 세션으로 간주 → 먼저 말 건 사람 집계
const GAP_MINUTES = 6 * 60; // 6시간

// 시스템 메시지/미디어로 취급해 길이·감정 계산에서 제외할 패턴
const SYSTEM_PATTERNS = [
  /^사진(\s*\d+장)?$/,
  /^동영상$/,
  /^이모티콘$/,
  /^삭제된 메시지입니다\.?$/,
  /님이 (들어왔습니다|나갔습니다)\.?$/,
  /^음성메시지$/,
  /^\(이모티콘\)$/,
];

function isSystem(text: string): boolean {
  const t = text.trim();
  return SYSTEM_PATTERNS.some((re) => re.test(t));
}

const AFFECTION_RE =
  /(ㅋㅋ|ㅎㅎ|ㅠ|ㅜ|❤|♥|😀|😁|😂|🤣|😊|😍|🥰|😘|😅|🙈|💕|💗|💓|👍|🤗|😉|😳|😭|🥺|✨|👏)/;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 두 화자 사이의 정량 지표를 계산한다.
 * me: 본인, other: 상대방
 */
export function computeMetrics(
  messages: KakaoMessage[],
  me: string,
  other: string
): Metrics {
  const relevant = messages.filter(
    (m) => m.speaker === me || m.speaker === other
  );

  const count = { me: 0, other: 0 };
  const lenSum = { me: 0, other: 0 };
  const lenCount = { me: 0, other: 0 };
  const questions = { me: 0, other: 0 };
  const affection = { me: 0, other: 0 };
  const initiations = { me: 0, other: 0 };

  // 응답 시간: 화자가 전환되는 순간의 시간차를 "응답한 사람"에게 귀속
  const replyMe: number[] = []; // 내가 상대에게 답한 시간
  const replyOther: number[] = []; // 상대가 나에게 답한 시간

  let firstTs: number | null = null;
  let lastTs: number | null = null;
  let prev: KakaoMessage | null = null;

  for (const m of relevant) {
    const side = m.speaker === me ? "me" : "other";
    count[side]++;

    if (m.timestamp != null) {
      if (firstTs == null) firstTs = m.timestamp;
      lastTs = m.timestamp;
    }

    const body = m.text.trim();
    const media = isSystem(body);

    if (!media && body.length > 0) {
      lenSum[side] += body.length;
      lenCount[side]++;
      if (/[?？]/.test(body)) questions[side]++;
      if (AFFECTION_RE.test(body)) affection[side]++;
    }

    // 먼저 말 건 사람 집계 & 응답 시간
    if (prev) {
      const gapMin =
        m.timestamp != null && prev.timestamp != null
          ? (m.timestamp - prev.timestamp) / 60000
          : null;

      if (gapMin != null && gapMin >= GAP_MINUTES) {
        // 새 대화 세션 시작 → 이 메시지 화자가 먼저 말 건 것
        initiations[side]++;
      } else if (prev.speaker !== m.speaker && gapMin != null && gapMin >= 0) {
        // 화자 전환 = 응답
        if (side === "me") replyMe.push(gapMin);
        else replyOther.push(gapMin);
      }
    } else {
      // 맨 첫 메시지 = 최초 개시
      initiations[side]++;
    }

    prev = m;
  }

  const spanDays =
    firstTs != null && lastTs != null
      ? Math.max(1, Math.round((lastTs - firstTs) / 86400000))
      : 0;

  const avgLength = {
    me: lenCount.me ? Math.round(lenSum.me / lenCount.me) : 0,
    other: lenCount.other ? Math.round(lenSum.other / lenCount.other) : 0,
  };

  const medianReplyMinutes = {
    me: median(replyMe),
    other: median(replyOther),
  };

  const questionRatio = {
    me: count.me ? +(questions.me / count.me).toFixed(3) : 0,
    other: count.other ? +(questions.other / count.other).toFixed(3) : 0,
  };

  const affectionRatio = {
    me: count.me ? +(affection.me / count.me).toFixed(3) : 0,
    other: count.other ? +(affection.other / count.other).toFixed(3) : 0,
  };

  const baseTemperature = scoreTemperature({
    count,
    medianReplyMinutes,
    initiations,
    questionRatio,
    affectionRatio,
  });

  return {
    me,
    other,
    messageCount: count,
    avgLength,
    medianReplyMinutes,
    initiations,
    questionRatio,
    affectionRatio,
    spanDays,
    totalMessages: relevant.length,
    baseTemperature,
  };
}

/**
 * 규칙 기반 온도(0~100). 가설 가중치이며 향후 튜닝 대상.
 * 상호성(대칭성)이 높을수록, 상대의 관심 신호(질문·감정표현·빠른 응답)가 클수록 높다.
 */
function scoreTemperature(args: {
  count: { me: number; other: number };
  medianReplyMinutes: { me: number | null; other: number | null };
  initiations: { me: number; other: number };
  questionRatio: { me: number; other: number };
  affectionRatio: { me: number; other: number };
}): number {
  const { count, medianReplyMinutes, initiations, questionRatio, affectionRatio } =
    args;

  // 1) 메시지 양 균형 (20%): 1에 가까울수록 대칭
  const totalMsg = count.me + count.other;
  const balance =
    totalMsg > 0 ? 1 - Math.abs(count.me - count.other) / totalMsg : 0;

  // 2) 응답 속도 (20%): 상대가 나에게 빨리 답할수록 높음. 30분 이내=1, 6시간=0
  const otherReply = medianReplyMinutes.other;
  const speed =
    otherReply == null ? 0.5 : clamp01(1 - (otherReply - 30) / (360 - 30));

  // 3) 대화 주도권 균형 (15%)
  const totalInit = initiations.me + initiations.other;
  const initBalance =
    totalInit > 0 ? 1 - Math.abs(initiations.me - initiations.other) / totalInit : 0;

  // 4) 상대의 질문 비율 (20%): 나에게 관심을 갖고 물어보는가. 0.15 이상이면 만점 근처
  const q = clamp01(questionRatio.other / 0.15);

  // 5) 감정표현 (15%): 상대의 표현. 0.25 이상 만점 근처
  const aff = clamp01(affectionRatio.other / 0.25);

  // 6) 나-상대 감정표현 대칭 (10%): 나만 과하지 않은지
  const affSym =
    affectionRatio.me + affectionRatio.other > 0
      ? 1 -
        Math.abs(affectionRatio.me - affectionRatio.other) /
          (affectionRatio.me + affectionRatio.other)
      : 0.5;

  const score =
    balance * 20 +
    speed * 20 +
    initBalance * 15 +
    q * 20 +
    aff * 15 +
    affSym * 10;

  return Math.round(clamp01(score / 100) * 100);
}

/**
 * "나"의 대화 습관 지표를 규칙 기반으로 계산한다.
 * (연속 발신, 심야 메시지, 응답 속도 비대칭 등)
 */
export function computeSelfPatterns(
  messages: KakaoMessage[],
  me: string,
  other: string,
  metrics: Metrics
): SelfPatterns {
  const relevant = messages.filter(
    (m) => m.speaker === me || m.speaker === other
  );

  let myCount = 0;
  let otherCount = 0;
  let myQuestions = 0;
  let myAffection = 0;

  // 연속 발신(burst) 분석: 같은 화자가 연달아 보낸 묶음
  const myBurstLengths: number[] = [];
  let runSpeaker: string | null = null;
  let runLen = 0;

  // 심야 메시지
  let myTimed = 0;
  let myLateNight = 0;

  const flushRun = () => {
    if (runSpeaker === me && runLen > 0) myBurstLengths.push(runLen);
  };

  for (const m of relevant) {
    const mine = m.speaker === me;
    if (mine) myCount++;
    else otherCount++;

    const body = m.text.trim();
    const media = isSystem(body);
    if (mine && !media && body.length > 0) {
      if (/[?？]/.test(body)) myQuestions++;
      if (AFFECTION_RE.test(body)) myAffection++;
    }

    if (mine && m.timestamp != null) {
      myTimed++;
      const h = new Date(m.timestamp).getHours();
      if (h >= 0 && h < 6) myLateNight++;
    }

    // burst 갱신
    if (m.speaker === runSpeaker) {
      runLen++;
    } else {
      flushRun();
      runSpeaker = m.speaker;
      runLen = 1;
    }
  }
  flushRun();

  const total = myCount + otherCount;
  const totalInit = metrics.initiations.me + metrics.initiations.other;

  // 연속 발신: 각 burst에서 첫 메시지를 제외한 나머지가 "상대 답 없이 추가로 보낸" 것
  const doubleTexts = myBurstLengths.reduce((a, b) => a + (b - 1), 0);
  const avgBurst =
    myBurstLengths.length > 0
      ? +(
          myBurstLengths.reduce((a, b) => a + b, 0) / myBurstLengths.length
        ).toFixed(2)
      : 0;

  const meReply = metrics.medianReplyMinutes.me;
  const otherReply = metrics.medianReplyMinutes.other;
  const replySpeedRatio =
    meReply != null && otherReply != null && otherReply > 0
      ? +(meReply / otherReply).toFixed(3)
      : null;

  return {
    messageShare: total > 0 ? +(myCount / total).toFixed(3) : 0,
    initiationShare:
      totalInit > 0 ? +(metrics.initiations.me / totalInit).toFixed(3) : 0,
    doubleTextRatio: myCount > 0 ? +(doubleTexts / myCount).toFixed(3) : 0,
    avgBurstLength: avgBurst,
    lateNightRatio: myTimed > 0 ? +(myLateNight / myTimed).toFixed(3) : 0,
    questionRatio: metrics.questionRatio.me,
    affectionRatio: metrics.affectionRatio.me,
    replySpeedRatio,
    myMessageCount: myCount,
  };
}

/** 대표 대화 발췌: LLM 컨텍스트용. 최근 N개 메시지를 익명화하여 반환 */
export function sampleConversation(
  messages: KakaoMessage[],
  me: string,
  other: string,
  limit = 60
): string {
  const relevant = messages.filter(
    (m) => m.speaker === me || m.speaker === other
  );
  const tail = relevant.slice(-limit);
  return tail
    .map((m) => {
      const who = m.speaker === me ? "나" : "상대";
      return `${who}: ${m.text.replace(/\n/g, " ").slice(0, 200)}`;
    })
    .join("\n");
}
