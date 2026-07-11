import { redirect } from "next/navigation";

/**
 * /broker/my-card → /broker/my-card/new 리다이렉트
 * BrokerMoreMenu에서 "/broker/my-card"로 링크하고 있으므로
 * 404 방지를 위해 자동 리다이렉트 처리
 */
export default function BrokerMyCardPage() {
  redirect("/broker/my-card/new");
}
