import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "고객 소통함 | 크리딜" },
  description: "구독자·고객 관리, 뉴스레터 발송 이력, 열람 반응을 실시간으로 확인합니다.",
};

export default function InboxWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
