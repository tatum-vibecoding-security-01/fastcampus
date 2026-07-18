// 토스페이먼츠 연동 공용 상수 · 상품 카탈로그.
//
// 보안 원칙: 결제 "금액"의 진실은 항상 서버에 있다. 클라이언트가 보내온 amount를
// 그대로 승인하면 결제 금액 변조(예: 4900원 상품을 100원으로 요청)가 가능하므로,
// 서버 승인 시 productId로 이 카탈로그의 금액과 대조해서 검증한다.

export const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

export type Product = {
  id: string;
  name: string;
  amount: number; // KRW
};

export const PRODUCTS: Record<string, Product> = {
  deep_report: {
    id: "deep_report",
    name: "썸닥터 심층 분석 리포트",
    amount: 4900,
  },
};

export function getProduct(id: string): Product | null {
  return PRODUCTS[id] ?? null;
}

// 서버에서만 사용. 클라이언트 번들에 절대 포함되면 안 된다.
export function tossAuthHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY 환경변수가 없습니다.");
  // Basic 인증: "시크릿키:" (콜론 포함, 비밀번호 없음)을 base64 인코딩.
  return "Basic " + Buffer.from(`${secret}:`).toString("base64");
}
