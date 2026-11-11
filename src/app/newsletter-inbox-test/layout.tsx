import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스레터 · 소통관리함 MECE 상용화 점검 워크벤치 | CRE DealCard",
  description:
    "인간 테스터를 위한 뉴스레터 스튜디오·소통관리함 6대 축 36문항 MECE 클릭 스루 상용화 완전 점검 가이드",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NewsletterInboxTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
