"use client";

function tempColor(t: number): string {
  if (t >= 70) return "#e0245e"; // 뜨거움
  if (t >= 45) return "#f5a623"; // 미지근
  return "#4a90d9"; // 차가움
}

function tempLabel(t: number): string {
  if (t >= 75) return "뜨거움";
  if (t >= 60) return "따뜻함";
  if (t >= 45) return "미지근";
  if (t >= 30) return "서늘함";
  return "차가움";
}

export default function TemperatureGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tempColor(v);

  // 반원 게이지: 반지름 80, 둘레의 절반
  const R = 80;
  const CIRC = Math.PI * R; // 반원 길이
  const dash = (v / 100) * CIRC;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-56 h-auto">
        {/* 배경 아크 */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke="rgba(26,26,46,0.10)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* 값 아크 */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          style={{ transition: "stroke-dasharray 1s ease-out" }}
        />
        <text
          x="100"
          y="98"
          textAnchor="middle"
          fontSize="40"
          fontWeight="800"
          fill={color}
        >
          {v}°
        </text>
      </svg>
      <span
        className="mt-1 rounded-full px-3 py-1 text-sm font-semibold"
        style={{ background: `${color}22`, color }}
      >
        {tempLabel(v)}
      </span>
    </div>
  );
}
