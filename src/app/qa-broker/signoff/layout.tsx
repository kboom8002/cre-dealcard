import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "중개인 감수 미팅 보드 | 크리딜",
  description:
    "크리딜 화·목 1인 중개인 감수 미팅 보드 · 22종 판정 요약 · 6대 기준 채점",
};

export default function QaBrokerSignoffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
