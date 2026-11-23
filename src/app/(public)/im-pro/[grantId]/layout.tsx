import type { Metadata } from 'next';
import { getCanonicalSiteUrl } from '@/lib/site-url';

const SITE_URL = getCanonicalSiteUrl();
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png?v=2`;

export const metadata: Metadata = {
  title: {
    absolute: '크리딜 (CREDEAL) — Pro Investment Memo',
  },
  description: '투자자 전용 프로 인베스트먼트 메모',
  openGraph: {
    title: '크리딜 (CREDEAL) — Pro IM',
    description: '투자자 전용 프로 인베스트먼트 메모',
    type: 'article',
    siteName: '크리딜 (CREDEAL)',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: '크리딜 (CREDEAL) — Pro IM',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '크리딜 (CREDEAL) — Pro IM',
    description: '투자자 전용 프로 인베스트먼트 메모',
    images: [DEFAULT_OG_IMAGE],
  },
  robots: 'noindex, nofollow', // Pro 문서는 검색 엔진 비노출
};

export default function ProIMLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
