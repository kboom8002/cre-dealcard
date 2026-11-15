import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "IM 제안서 | 크리딜" },
  description: "사진·렌트롤 업로드로 10섹션 모바일 IM과 PPTX 투자설명서를 생성합니다.",
};

export default function ImWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
