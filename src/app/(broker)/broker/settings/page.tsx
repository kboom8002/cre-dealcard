import { redirect } from 'next/navigation';

/**
 * GET /broker/settings
 * 레거시/내부 설정 링크 진입 시 정식 중개사 프로필·명함 설정 화면(/broker/profile)으로 즉시 연결합니다.
 */
export default function BrokerSettingsPage() {
  redirect('/broker/profile');
}
