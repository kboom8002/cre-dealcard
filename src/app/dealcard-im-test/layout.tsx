import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "딜카드 · IM 상용화 MECE 완전 점검 가이드 | CREDEAL",
  description:
    "인간 테스터용 딜카드 공간(/broker/w/dealcards) · IM 공간(/broker/w/im) UI/UX, 기능, 카톡 OG, 모바일 IM, PPTX 산출물 클릭 스루 완전 점검 워크벤치",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DealCardImTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
