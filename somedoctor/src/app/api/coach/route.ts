import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { coachSystem, coachUser } from "@/lib/prompts";
import type { Metrics, ReplyOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return text;
  return text.slice(start, end + 1);
}

interface CoachBody {
  metrics: Metrics;
  analysisSummary: string;
  recentContext: string;
  incoming: string;
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

  let body: CoachBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { metrics, analysisSummary, recentContext, incoming } = body;
  if (!metrics || !incoming?.trim()) {
    return NextResponse.json(
      { error: "답장할 상대의 메시지를 입력해 주세요." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1600,
      system: coachSystem(metrics, analysisSummary ?? ""),
      messages: [
        { role: "user", content: coachUser(incoming, recentContext ?? "") },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    let parsed: { options: ReplyOption[] };
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch {
      return NextResponse.json(
        { error: "답장 제안을 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    const options = Array.isArray(parsed.options)
      ? parsed.options.slice(0, 3)
      : [];
    if (options.length === 0) {
      return NextResponse.json(
        { error: "답장 제안을 생성하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { options },
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
