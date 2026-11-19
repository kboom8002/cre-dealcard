import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "중개인 산출물 쇼룸 | 크리딜",
  description:
    "크리딜 중개인 전문가 감수 전용 22종 실물 산출물 쇼룸 · Red-Pen 문구 교정",
  robots: { index: false, follow: false },
};

export default function QaBrokerShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
