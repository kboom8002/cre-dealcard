import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "뉴스레터 에디터 | 크리딜" },
  description: "중개인 전용 뉴스레터·매거진 상세 편집기.",
};

export default function MagazineEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
