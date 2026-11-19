import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "테스터 리허설 허브 | 크리딜",
  description:
    "크리딜 일반 테스터 전용 1차 28건 재검증 · 2차 6대 실기기 미션 · 서버 제출 허브",
  robots: { index: false, follow: false },
};

export default function QaTesterSignoffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
