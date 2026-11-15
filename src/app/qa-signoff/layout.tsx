import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "협업 검수 허브 | 크리딜" },
  description:
    "실물 검수 미션(M1~M8), 핀 피드백 수집함, 최종 승인 제출을 한곳에서 진행합니다.",
};

export default function QaSignoffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
