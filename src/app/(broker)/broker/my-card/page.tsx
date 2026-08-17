// @ts-nocheck DORMANT: entire file dormant
import { redirect } from "next/navigation";

/**
 * /broker/my-card → /broker/profile 리다이렉트
 * 레거시 경로 직접 입력 시 활성화된 프로필 관리 페이지로 이동
 */
export default function BrokerMyCardPage() {
  /* DORMANT: vibe-card */ redirect("/broker");
  redirect("/broker/profile");
}
