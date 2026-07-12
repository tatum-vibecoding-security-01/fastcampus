import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeSystem, metricsToText } from "@/lib/prompts";
import type { Analysis, Metrics } from "@/lib/types";

export const runtime = "nodejs";
// 비저장 원칙: 어떤 응답도 캐시하지 않는다.
export const dynamic = "force-dynamic";

function extractJson(text: string): string {
  // 코드펜스나 앞뒤 잡텍스트가 있어도 첫 { ~ 마지막 } 를 추출
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return text;
  return text.slice(start, end + 1);
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

위 데이터를 분석해 지정된 JSON 스키마(temperature, headline, signals[3], summary)로만 응답하세요. 다른 텍스트나 코드펜스는 붙이지 마세요.`;

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      system: analyzeSystem(),
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    let analysis: Analysis;
    try {
      analysis = JSON.parse(extractJson(rawText));
    } catch {
      return NextResponse.json(
        { error: "분석 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    // 온도 안전 클램프
    analysis.temperature = Math.max(
      0,
      Math.min(100, Math.round(analysis.temperature))
    );

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
