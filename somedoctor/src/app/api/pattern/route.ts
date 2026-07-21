import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { patternSystem } from "@/lib/prompts";
import { requirePremium } from "@/lib/entitlement";
import type { Metrics, PatternFeedback, SelfPatterns } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return text;
  return text.slice(start, end + 1);
}

interface PatternBody {
  metrics: Metrics;
  patterns: SelfPatterns;
}

export async function POST(req: NextRequest) {
  // 접근 통제: 대화 습관 상세 리포트는 프리미엄(이용권) 전용 기능.
  const gate = await requirePremium();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

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

  let body: PatternBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { metrics, patterns } = body;
  if (!metrics || !patterns) {
    return NextResponse.json(
      { error: "지표 데이터가 없습니다." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1800,
      system: patternSystem(metrics, patterns),
      messages: [
        {
          role: "user",
          content:
            "위 나의 대화 습관 지표를 분석해 JSON(headline, items[])으로만 응답하세요.",
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    let feedback: PatternFeedback;
    try {
      feedback = JSON.parse(extractJson(rawText));
    } catch {
      return NextResponse.json(
        { error: "피드백을 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    if (!feedback.items?.length) {
      return NextResponse.json(
        { error: "피드백을 생성하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { feedback },
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
