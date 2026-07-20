import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { chatSystem } from "@/lib/prompts";
import { getUser } from "@/lib/supabase/server";
import type { Metrics } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  metrics: Metrics;
  analysisSummary: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return new Response("로그인이 필요해요.", { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인하세요.",
      { status: 500 }
    );
  }

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return new Response("잘못된 요청입니다.", { status: 400 });
  }

  const { metrics, analysisSummary, messages } = body;
  if (!metrics || !messages?.length) {
    return new Response("대화 컨텍스트가 없습니다.", { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const system = chatSystem(metrics, analysisSummary ?? "");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 1500,
          system,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        s.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });

        await s.finalMessage();
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "알 수 없는 오류";
        controller.enqueue(encoder.encode(`\n\n[오류] ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
