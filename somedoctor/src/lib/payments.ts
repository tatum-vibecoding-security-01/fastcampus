// 결제 상품 정의 및 서버 상수.
// 금액은 반드시 서버에서 결정하고 검증한다. 클라이언트가 보낸 금액은 신뢰하지 않는다.

export const PREMIUM_PRODUCT = {
  /** 프리미엄 리포트 단건 가격 (KRW). 이 값이 유일한 신뢰 소스(source of truth). */
  amount: 9900,
  orderName: "썸닥터 프리미엄 리포트",
  currency: "KRW",
} as const;

export type OrderStatus = "PENDING" | "DONE" | "FAILED";

export interface OrderRow {
  order_id: string;
  user_id: string;
  amount: number;
  order_name: string;
  status: OrderStatus;
  payment_key: string | null;
  approved_at: string | null;
  created_at: string;
}

// 토스페이먼츠 결제 승인 API 엔드포인트.
export const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

/** 시크릿 키로 Basic 인증 헤더 생성. `${secretKey}:` 를 base64 인코딩. */
export function tossAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}
