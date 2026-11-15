import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "딜카드 | 크리딜" },
  description: "매물 메모 한 줄로 블라인드 안전 딜카드와 카카오 공유 링크를 제작합니다.",
};

export default function DealcardsWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
