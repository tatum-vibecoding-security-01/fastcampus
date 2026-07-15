// analyses 테이블 연결/RLS 테스트
// 실행: node scripts/test-analyses.mjs
// .env.local 의 anon 키로 연결해 ①테이블 존재 ②INSERT 허용 ③SELECT 차단 을 검증.
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
console.log("URL:", url);
console.log("KEY:", key ? key.slice(0, 12) + "…(" + key.length + " chars)" : "(없음)");
if (!url || !key) { console.error("❌ 환경변수 누락"); process.exit(1); }

const supabase = createClient(url, key);

// 테이블명 후보: 우리 DDL은 analyses. 혹시 analysis 로 만들었을 수도 있어 자동 탐지.
async function detectTable() {
  for (const name of ["analyses", "analysis"]) {
    const { error } = await supabase.from(name).select("id").limit(1);
    // PGRST205 = 테이블 없음. 그 외(빈 결과/권한)면 테이블은 존재.
    if (!error || error.code !== "PGRST205") return name;
  }
  return null;
}

const table = await detectTable();
if (!table) { console.error("❌ analyses/analysis 테이블을 찾지 못했습니다."); process.exit(2); }
console.log(`\n✅ 대상 테이블: "${table}"`);

// ── ① SELECT 시도 (RLS 설계상 anon 은 막혀 빈 배열이어야 정상) ──
const sel = await supabase.from(table).select("*", { count: "exact" }).limit(3);
if (sel.error) {
  console.log("① SELECT 결과: 오류 →", sel.error.code, sel.error.message);
} else {
  console.log(`① SELECT 결과: 성공, 반환 행수=${sel.data.length}, count=${sel.count}`);
  if (sel.data.length > 0) console.log("   ⚠️ anon 이 데이터를 읽을 수 있음 — RLS SELECT 차단이 안 걸려 있을 수 있음");
  else console.log("   → 빈 결과. (RLS로 SELECT 차단 시 기대 동작)");
}

// ── ② INSERT 시도 (anon INSERT 정책이 있으면 성공해야 함) ──
const sample = {
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
};
const ins = await supabase.from(table).insert(sample);
if (ins.error) {
  console.log("\n② INSERT 결과: 오류 →", ins.error.code, ins.error.message);
  if (ins.error.code === "42501" || /row-level security/i.test(ins.error.message))
    console.log("   → RLS INSERT 정책이 없거나 anon 에게 허용 안 됨.");
} else {
  console.log("\n② INSERT 결과: ✅ 성공 (샘플 1행 적재)");
  console.log("   session_id =", sample.client_session_id);
}

console.log("\n요약: 연결 자체는 URL+anon키로 성립. 테이블명은 질의 대상일 뿐 별도 자격증명 불필요.");
