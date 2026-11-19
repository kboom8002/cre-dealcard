import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "내부 QA 테스트 가이드 | 크리딜",
  description: "내부 QA 및 테스터 검증 가이드 문서입니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TestguideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
