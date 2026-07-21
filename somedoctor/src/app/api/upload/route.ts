import { NextRequest, NextResponse } from "next/server";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  validateTextUpload,
  generateSafeFilename,
  isSafeFilename,
} from "@/lib/uploadSecurity";
import { requireAuth } from "@/lib/entitlement";

export const runtime = "nodejs";
// 비저장 원칙: 업로드 파일은 디스크에 쓰지 않고 메모리에서 검증만 한다.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 접근 통제: 업로드는 로그인한 사용자만 (익명 리소스 남용 방지).
  const gate = await requireAuth();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 멀티파트 폼 파싱
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "잘못된 업로드 요청입니다." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "업로드된 파일이 없습니다." },
      { status: 400 }
    );
  }

  // 1) 크기 선검사 (본문 읽기 전에 File.size로 빠르게 거부)
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 커요. 최대 ${MAX_UPLOAD_MB}MB까지 업로드할 수 있어요.` },
      { status: 413 }
    );
  }

  // 2) 내용 기반 검증: 확장자/MIME이 아닌 실제 바이트를 UTF-8로 디코딩해 텍스트인지 확인
  const buffer = await file.arrayBuffer();
  const result = validateTextUpload(buffer);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 415 });
  }

  // 3) 파일명은 원본을 신뢰하지 않고 서버에서 랜덤 재생성 후 형태를 검증
  const safeName = generateSafeFilename();
  if (!isSafeFilename(safeName)) {
    // 정상 경로에선 발생하지 않지만, 방어적으로 검증 실패 시 처리 중단
    return NextResponse.json(
      { error: "파일명 생성에 실패했습니다. 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  // 검증만 하고 저장하지 않는다. 파싱에 쓸 안전한 텍스트를 클라이언트로 반환.
  return NextResponse.json(
    { ok: true, filename: safeName, byteLength: result.byteLength, text: result.text },
    { headers: { "Cache-Control": "no-store" } }
  );
}
