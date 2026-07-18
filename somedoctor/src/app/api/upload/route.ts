import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
// 비저장 원칙: 업로드 내용은 메모리에서만 검증하고 어떤 응답도 캐시하지 않는다.
export const dynamic = "force-dynamic";

// 업로드 상한: 5MB
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// 사용자에게 노출하는 실패 메시지. 어떤 검증에서 실패했는지(크기/인코딩/형식)를
// 드러내지 않는 단일 일반 문구. 구체적인 사유는 서버 로그에만 남긴다.
const GENERIC_ERROR =
  "파일을 처리할 수 없어요. 올바른 카카오톡 대화 .txt 파일(최대 5MB)인지 확인해 주세요.";

/**
 * 보안 이벤트 로그: 서버 콘솔에만 남긴다. 프론트로는 절대 반환하지 않는다.
 * 개인정보 보호를 위해 파일 '내용'은 로그에 남기지 않는다(사유·크기·서버 발급 id만).
 */
function logSecurityEvent(
  reason: string,
  detail: Record<string, unknown>
): void {
  // 실제 운영에서는 구조화 로거로 대체. 여기서는 서버 콘솔에만 기록.
  console.warn(
    `[upload-validation] ${reason} ${JSON.stringify(detail)}`
  );
}

function fail(): NextResponse {
  // 사용자에게는 원인을 알 수 없는 일반 메시지만 반환.
  return NextResponse.json(
    { error: GENERIC_ERROR },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  // 서버가 파일명을 신뢰하지 않는다. 안전한 랜덤값을 서버에서 발급해 참조에 사용.
  const uploadId = randomUUID();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    logSecurityEvent("malformed-multipart", { uploadId });
    return fail();
  }

  if (!file) {
    logSecurityEvent("missing-file-field", { uploadId });
    return fail();
  }

  // ① 크기 검사 — 우선 신고된 크기로 조기 차단(대용량 버퍼링 방지)
  if (file.size > MAX_FILE_BYTES) {
    logSecurityEvent("oversize-declared", {
      uploadId,
      size: file.size,
      clientName: file.name,
    });
    return fail();
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    logSecurityEvent("read-failed", { uploadId });
    return fail();
  }

  // 실제 바이트 길이로 다시 확인 — 클라이언트가 신고한 size를 신뢰하지 않는다.
  if (bytes.byteLength > MAX_FILE_BYTES) {
    logSecurityEvent("oversize-actual", {
      uploadId,
      size: bytes.byteLength,
    });
    return fail();
  }

  // ② 확장자/MIME을 믿지 않는다. 실제 바이트가 UTF-8 텍스트로 디코딩되는지
  //    fatal 모드로 검증한다(깨진/이진 바이트가 있으면 예외 발생).
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    logSecurityEvent("not-utf8-text", {
      uploadId,
      size: bytes.byteLength,
      clientType: file.type,
    });
    return fail();
  }

  // 검증 통과. 내용은 저장하지 않고, 검증된 텍스트만 응답으로 돌려준다.
  return NextResponse.json(
    { text },
    { headers: { "Cache-Control": "no-store" } }
  );
}
