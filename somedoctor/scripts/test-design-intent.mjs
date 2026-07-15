// analyses 테이블 — SQL 설계 의도 검증 테스트
// 실행: node scripts/test-design-intent.mjs
//
// schema.sql 설계 의도가 실제 DB에서 지켜지는지 확인한다:
//   [A] RLS: anon 은 INSERT 만. SELECT/UPDATE/DELETE 는 차단(또는 0행).
//   [B] CHECK 제약: 온도 0~100, 비율 0~1, 카운트 음수 불가 → 위반 시 거부.
//   [C] NOT NULL / nullable: nullable 필드는 null 허용, not null 필드는 누락 시 거부.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = loadEnv(join(__dirname, "..", ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("❌ 환경변수 누락"); process.exit(1); }
const supabase = createClient(url, key);
const TABLE = "analyses";

// 유효한 기준 행. 개별 필드만 바꿔가며 CHECK 제약을 시험한다.
const validRow = () => ({
  client_session_id: randomUUID(),
  msg_count_me: 42, msg_count_other: 51,
  avg_len_me: 12.3, avg_len_other: 9.8,
  median_reply_min_me: 4.5, median_reply_min_other: 7.2,
  initiations_me: 5, initiations_other: 8,
  question_ratio_me: 0.21, question_ratio_other: 0.34,
  affection_ratio_me: 0.4, affection_ratio_other: 0.55,
  span_days: 30, total_messages: 93,
  base_temperature: 62, temperature: 68,
  self_message_share: 0.45, self_initiation_share: 0.38,
  self_double_text_ratio: 0.12, self_avg_burst_length: 1.4,
  self_late_night_ratio: 0.08, self_question_ratio: 0.21,
  self_affection_ratio: 0.4, self_reply_speed_ratio: 0.7,
  self_my_message_count: 42,
});

let pass = 0, fail = 0;
function ok(cond, label, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  — " + extra : ""}`);
  cond ? pass++ : fail++;
}
const isCheckViolation = (e) => e && (e.code === "23514" || /check constraint/i.test(e.message || ""));
const isRlsOrNotFound = (e) => e && (e.code === "42501" || /row-level security/i.test(e.message || ""));

// expectRejected: INSERT 가 CHECK 제약으로 거부돼야 하는 케이스
async function expectRejected(label, patch) {
  const { error } = await supabase.from(TABLE).insert({ ...validRow(), ...patch });
  ok(isCheckViolation(error), label, error ? `code=${error.code}` : "거부되지 않고 통과됨(문제)");
}
// expectAccepted: INSERT 가 허용돼야 하는 케이스
async function expectAccepted(label, patch) {
  const { error } = await supabase.from(TABLE).insert({ ...validRow(), ...patch });
  ok(!error, label, error ? `${error.code} ${error.message}` : "");
}

console.log("=== [A] RLS 정책 (anon = INSERT 전용) ===");
{
  // 되읽기 차단: SELECT 는 성공하되 0행이어야 한다(RLS SELECT 정책 없음).
  const sel = await supabase.from(TABLE).select("*", { count: "exact" }).limit(1);
  ok(!sel.error && sel.data.length === 0, "SELECT 는 되읽기 불가(0행 반환)",
     sel.error ? sel.error.code : `rows=${sel.data.length}, count=${sel.count}`);

  // INSERT 는 허용.
  const ins = await supabase.from(TABLE).insert(validRow());
  ok(!ins.error, "INSERT 는 허용", ins.error ? ins.error.message : "");

  // UPDATE 는 정책 없음 → 매칭 0행(변조 불가). 오류 없이 0행 영향이어야 정상.
  const upd = await supabase.from(TABLE).update({ temperature: 1 })
    .eq("client_session_id", randomUUID()).select();
  ok(!upd.error ? (upd.data?.length ?? 0) === 0 : isRlsOrNotFound(upd.error),
     "UPDATE 는 변조 불가(0행/차단)", upd.error ? upd.error.code : `affected=${upd.data?.length ?? 0}`);

  // DELETE 도 정책 없음 → 0행.
  const del = await supabase.from(TABLE).delete()
    .eq("client_session_id", randomUUID()).select();
  ok(!del.error ? (del.data?.length ?? 0) === 0 : isRlsOrNotFound(del.error),
     "DELETE 는 삭제 불가(0행/차단)", del.error ? del.error.code : `affected=${del.data?.length ?? 0}`);
}

console.log("\n=== [B] CHECK 제약 (범위/부호) — 위반 INSERT 는 거부되어야 함 ===");
await expectRejected("온도 > 100 거부", { temperature: 101 });
await expectRejected("온도 < 0 거부", { temperature: -1 });
await expectRejected("base_temperature > 100 거부", { base_temperature: 150 });
await expectRejected("question_ratio_me > 1 거부", { question_ratio_me: 1.5 });
await expectRejected("affection_ratio_other < 0 거부", { affection_ratio_other: -0.1 });
await expectRejected("self_message_share > 1 거부", { self_message_share: 2 });
await expectRejected("msg_count_me 음수 거부", { msg_count_me: -1 });
await expectRejected("span_days 음수 거부", { span_days: -5 });
await expectRejected("avg_len_me 음수 거부", { avg_len_me: -3 });
await expectRejected("median_reply_min_me 음수 거부", { median_reply_min_me: -2 });

console.log("\n=== [B'] 경계값 (0, 1, 100) 은 허용되어야 함 ===");
await expectAccepted("온도 0/100 경계 허용", { temperature: 100, base_temperature: 0 });
await expectAccepted("비율 0/1 경계 허용", { question_ratio_me: 0, affection_ratio_me: 1 });

console.log("\n=== [C] NULL 처리 ===");
await expectAccepted("nullable 응답시간/속도비율 null 허용",
  { median_reply_min_me: null, median_reply_min_other: null, self_reply_speed_ratio: null });
{
  // NOT NULL 필드 누락 → 거부(23502).
  const bad = validRow(); delete bad.temperature;
  const { error } = await supabase.from(TABLE).insert(bad);
  ok(error && (error.code === "23502" || /null value/i.test(error.message || "")),
     "NOT NULL 필드(temperature) 누락 거부", error ? `code=${error.code}` : "통과됨(문제)");
}

console.log(`\n요약: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
