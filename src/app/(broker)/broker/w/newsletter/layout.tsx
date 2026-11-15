import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "뉴스레터 | 크리딜" },
  description: "주간·월간 상업용 부동산 브리핑과 추천 매물 매거진을 발행합니다.",
};

export default function NewsletterWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
