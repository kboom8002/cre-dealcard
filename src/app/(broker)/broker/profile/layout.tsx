import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "내 프로필 · 사무소 설정 | 크리딜" },
  description: "공인중개사 법정 표시사항, 직통 연락처, 전문 권역을 설정합니다.",
};

export default function BrokerProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
