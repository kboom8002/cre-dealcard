import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "테스터 검수 쇼룸 | 크리딜",
  description:
    "크리딜 일반 테스터 전용 22종 산출물 기술 검증·1차 28건 재확인 쇼룸",
};

export default function QaTesterShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
