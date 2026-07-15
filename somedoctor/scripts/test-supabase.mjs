// Supabase 연결 테스트 스크립트
// 실행: node scripts/test-supabase.mjs
// .env.local 을 읽어 "test" 테이블 조회를 시도한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// .env.local 파싱 (dotenv 없이 최소 구현)
function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch (e) {
    console.error(`.env.local 을 읽을 수 없습니다: ${e.message}`);
    process.exit(1);
  }
  return env;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = loadEnv(join(__dirname, "..", ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("URL:", url);
console.log("KEY:", key ? key.slice(0, 16) + "…(" + key.length + " chars)" : "(없음)");

if (!url || !key) {
  console.error("❌ 환경변수 누락");
  process.exit(1);
}

const supabase = createClient(url, key);

console.log('\n▶ "test" 테이블 조회 시도...');
const { data, error, count } = await supabase
  .from("test")
  .select("*", { count: "exact" })
  .limit(5);

if (error) {
  console.error("❌ 조회 오류:", JSON.stringify(error, null, 2));
  process.exit(2);
}

console.log(`✅ 연결 성공! "test" 테이블 행 수: ${count}`);
console.log("샘플 데이터(최대 5행):", JSON.stringify(data, null, 2));
