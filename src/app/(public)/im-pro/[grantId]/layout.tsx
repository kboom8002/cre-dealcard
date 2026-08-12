import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CRE Deal Card — Pro Investment Memo',
  description: '투자자 전용 프로 인베스트먼트 메모',
  openGraph: {
    title: 'CRE Deal Card — Pro IM',
    description: '투자자 전용 프로 인베스트먼트 메모',
    type: 'article',
  },
  robots: 'noindex, nofollow', // Pro 문서는 검색 엔진 비노출
};

export default function ProIMLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
