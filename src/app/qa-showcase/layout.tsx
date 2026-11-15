import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "실물 산출물 쇼룸 | 크리딜" },
  description:
    "뉴스레터 6종 · 딜카드 8종 · 모바일/PPTX IM 8종 실물 산출물을 한눈에 비교 검수합니다.",
};

export default function QaShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
