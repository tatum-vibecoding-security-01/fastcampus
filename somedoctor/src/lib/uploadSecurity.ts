// 업로드 보안 공용 모듈 (클라이언트/서버 양쪽에서 사용)
// - 크기 제한(5MB)
// - 확장자가 아닌 실제 내용 기반 텍스트 검증(UTF-8 fatal 디코딩 + 제어문자 검사)
// - 파일명 서버 랜덤 재생성 및 검증

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

// 재생성된 안전 파일명이 반드시 만족해야 하는 형태: 32자리 hex + .txt
export const SAFE_FILENAME_RE = /^[0-9a-f]{32}\.txt$/;

export type ValidateResult =
  | { ok: true; text: string; byteLength: number }
  | { ok: false; error: string };

// 바이트 배열의 크기와 "실제 텍스트 여부"를 검증하고, 유효하면 디코딩된 텍스트를 돌려준다.
// 확장자나 MIME 타입을 신뢰하지 않고, 바이트를 UTF-8로 엄격 디코딩해서 판단한다.
export function validateTextUpload(input: ArrayBuffer | Uint8Array): ValidateResult {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);

  // 1) 크기 검사
  if (view.byteLength === 0) {
    return { ok: false, error: "빈 파일이에요. 내용이 있는 .txt 파일을 올려주세요." };
  }
  if (view.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `파일이 너무 커요. 최대 ${MAX_UPLOAD_MB}MB까지 업로드할 수 있어요.`,
    };
  }

  // 2) UTF-8 엄격(fatal) 디코딩 — 잘못된 바이트 시퀀스(대부분의 바이너리)면 예외 발생
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return {
      ok: false,
      error:
        "텍스트 파일이 아니에요. 카카오톡에서 '텍스트만' 형식으로 내보낸 .txt 파일을 올려주세요.",
    };
  }

  // 3) NULL 바이트 / 과도한 제어문자 → 바이너리로 간주 (UTF-8로 우연히 디코딩되는 경우 대비)
  if (text.indexOf("\u0000") !== -1) {
    return { ok: false, error: "텍스트 파일이 아니에요. (바이너리 데이터가 감지됨)" };
  }
  // 탭(\t=09), 개행(\n=0A, \r=0D)은 허용, 나머지 C0 제어문자만 카운트
  const controlMatches = text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g);
  const controlCount = controlMatches ? controlMatches.length : 0;
  if (controlCount / text.length > 0.01) {
    return { ok: false, error: "텍스트 파일이 아니에요. (비정상 제어문자가 많음)" };
  }

  return { ok: true, text, byteLength: view.byteLength };
}

// 원본 파일명을 신뢰하지 않고 서버에서 완전히 새 랜덤 파일명을 생성한다.
// 원본 이름/경로/확장자는 사용하지 않으므로 경로 탐색(../)·확장자 위조가 원천 차단된다.
export function generateSafeFilename(): string {
  const uuid = globalThis.crypto.randomUUID().replace(/-/g, ""); // 32자리 hex
  return `${uuid}.txt`;
}

// 재생성된 파일명이 기대한 안전 패턴을 만족하는지 검증한다.
export function isSafeFilename(name: string): boolean {
  return SAFE_FILENAME_RE.test(name);
}
