import { redirect } from "next/navigation";

/**
 * /broker/my-card → /broker/vibe-card 리다이렉트
 * 레거시 경로 직접 입력 시 활성화된 Vibe 명함 관리 페이지로 이동
 */
export default function BrokerMyCardPage() {
  redirect("/broker/vibe-card");
}
