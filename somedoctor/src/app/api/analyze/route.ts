import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeSystem, metricsToText, ANALYSIS_SCHEMA } from "@/lib/prompts";
import type { Analysis, Metrics } from "@/lib/types";

export const runtime = "nodejs";
// 비저장 원칙: 어떤 응답도 캐시하지 않는다.
export const dynamic = "force-dynamic";

type Tone = "positive" | "neutral" | "caution";
const TONES: Tone[] = ["positive", "neutral", "caution"];

/**
 * 방어적 정규화: 모델이 스키마를 벗어난 형태(신호를 문자열로 반환 등)를 보내도
 * 프론트(ResultDashboard)가 기대하는 {title, detail, tone} 형태로 강제 변환한다.
 */
function normalizeAnalysis(raw: unknown): Analysis {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const signalsIn = Array.isArray(obj.signals) ? obj.signals : [];
  const signals = signalsIn.slice(0, 3).map((s) => {
    if (typeof s === "string") {
      return { title: "신호", detail: s, tone: "neutral" as Tone };
    }
    const o = (s ?? {}) as Record<string, unknown>;
    const tone = TONES.includes(o.tone as Tone) ? (o.tone as Tone) : "neutral";
    return {
      title: typeof o.title === "string" ? o.title : "신호",
      detail:
        typeof o.detail === "string"
          ? o.detail
          : typeof o.title === "string"
          ? o.title
          : "",
      tone,
    };
  });

  const tempNum = Number(obj.temperature);
  return {
    temperature: Math.max(
      0,
      Math.min(100, Math.round(Number.isFinite(tempNum) ? tempNum : 50))
    ),
    headline: typeof obj.headline === "string" ? obj.headline : "",
    signals,
    summary: typeof obj.summary === "string" ? obj.summary : "",
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인하세요.",
      },
      { status: 500 }
    );
  }

  let body: { metrics: Metrics; sample: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { metrics, sample } = body;
  if (!metrics || !sample) {
    return NextResponse.json(
      { error: "지표 또는 대화 샘플이 없습니다." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  const userContent = `${metricsToText(metrics)}

[대화 발췌 (익명화, 최근 순)]
${sample}

위 데이터를 분석해 record_analysis 도구로 결과를 제출하세요. signals는 정확히 3개, 각각 title·detail·tone을 모두 채웁니다.`;

  // tool use로 출력 구조를 강제한다(자유 JSON 파싱 대신). strict로 스키마를 검증.
  const analysisTool = {
    name: "record_analysis",
    description: "관계 진단 결과를 지정된 구조로 제출한다.",
    strict: true,
    input_schema: ANALYSIS_SCHEMA,
  } as unknown as Anthropic.Tool;

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      system: analyzeSystem(),
      messages: [{ role: "user", content: userContent }],
      tools: [analysisTool],
      tool_choice: { type: "tool", name: "record_analysis" },
    });

    const toolUse = resp.content.find((b) => b.type === "tool_use");
    if (!toolUse || !("input" in toolUse)) {
      return NextResponse.json(
        { error: "분석 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    // 방어적 정규화로 프론트 계약(신호 객체 3개)을 보장
    const analysis = normalizeAnalysis(toolUse.input);

    return NextResponse.json(
      { analysis },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `Claude API 호출 실패: ${msg}` },
      { status: 502 }
    );
  }
}
