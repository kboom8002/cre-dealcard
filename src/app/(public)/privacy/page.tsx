import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONFIRM_TTL_DAYS_TEXT,
  LegalList,
  LegalPage,
  LegalSection,
  RECONFIRM_YEARS_TEXT,
  RETENTION_EVENTS_DAYS,
  RETENTION_UNSUBSCRIBED_DAYS,
  getPrivacyContactText,
} from './legal-shared';

export const metadata: Metadata = {
  title: '개인정보 수집·이용 안내 | CRE DealCard 매거진',
  description: '매거진 구독 시 수집하는 개인정보의 항목, 이용 목적, 보유 기간, 처리위탁, 파기 방법과 이용자의 권리를 안내합니다.',
};

// 주의(코드 주석): 법무 검토 전 초안. 검토 필요 사항은 docs/magazine/audit-2026-10-04/legal-review-needed.md 참조.
// 보유기간 수치는 retention-purge(마이그레이션 000014 + /api/cron/retention-purge)와 일치해야 한다 — legal-shared.tsx 주석 참고.

export default function PrivacyPage() {
  const contact = getPrivacyContactText();
  return (
    <LegalPage title="개인정보 수집·이용 안내">
      <p>
        CRE DealCard(credeal.net, 이하 &quot;서비스&quot;)는 매거진 구독 신청 시 아래와 같이 개인정보를 수집·이용합니다.
        동의를 거부하실 수 있으나, 필수 항목에 동의하지 않으시면 매거진 구독이 제한됩니다.
      </p>

      <LegalSection title="1. 수집하는 개인정보 항목">
        <LegalList
          items={[
            <>
              <strong>필수</strong>: 수신 채널에 따른 연락처 — 휴대전화번호(카카오 알림톡 수신 시) 또는 이메일 주소(이메일 수신 시)
            </>,
            <>
              <strong>선택</strong>: 이름(호칭), 관심 지역·자산 유형 태그, 야간(오후 9시~오전 8시) 광고성 정보 수신 동의 여부
            </>,
            <>
              <strong>동의 기록</strong>: 개인정보 수집·이용 동의 및 광고성 정보 수신 동의의 일시·버전·동의 경로, 만 14세 이상 확인 여부,
              접속 IP의 해시값(원문 IP는 저장하지 않습니다)
            </>,
            <>
              <strong>서비스 이용 중 자동 생성</strong>: 매거진 열람·클릭 이력(익명 자체 식별자 기반 — 이름·연락처와 직접 연결하지 않는
              1st-party ID 사용)
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. 수집·이용 목적">
        <LegalList
          items={[
            '구독 확인(본인 확인 링크 발송) 및 매거진(이메일·카카오 알림톡) 발송',
            '광고성 정보 수신 동의·철회(수신거부) 이력 관리 및 주기적 재확인',
            '관심 지역·자산 유형에 맞춘 콘텐츠 구성',
            '열람 이력의 통계 분석을 통한 콘텐츠·서비스 개선',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 보유 및 이용 기간">
        <LegalList
          items={[
            '구독 중에는 구독 서비스 제공을 위해 보유합니다.',
            <>
              수신을 거부(해지)하시면 해지일로부터 <strong>{RETENTION_UNSUBSCRIBED_DAYS}일이 지난 뒤</strong> 이름·휴대전화번호·이메일
              주소·동의 IP 해시 등 개인을 식별할 수 있는 정보를 복구할 수 없는 방식으로 익명화(파기)합니다. 익명화된 기록에는 개인을
              식별할 수 있는 정보가 남지 않습니다.
            </>,
            <>
              열람·클릭 이력은 수집일로부터 <strong>{RETENTION_EVENTS_DAYS}일이 지나면</strong> 삭제합니다.
            </>,
            <>
              광고성 정보 수신 동의는 동의일로부터 {RECONFIRM_YEARS_TEXT}마다 수신 의사를 다시 확인하며, 확인하지 않으면 발송이 중단될
              수 있습니다.
            </>,
            <>
              구독 확인 링크는 신청 후 {CONFIRM_TTL_DAYS_TEXT} 동안만 유효하며, 확인이 완료되지 않은 신청에는 매거진을 발송하지
              않습니다. 확인되지 않은 신청 정보의 삭제는 아래 연락처로 요청하실 수 있습니다.
            </>,
            '다른 법령에 따라 보존해야 하는 정보는 해당 법령이 정한 기간 동안 보관합니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. 개인정보의 제공">
        <p>
          서비스는 이용자의 개인정보를 이용 목적 범위를 넘어 이용하거나 제3자에게 판매·제공하지 않습니다. 다만 구독 신청 시
          선택하신 매거진 발행 중개사의 이름으로 매거진이 발송되며, 해당 중개사는 매거진 발송과 구독 관리를 위해 구독 정보를 이용합니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 개인정보 처리 위탁">
        <p>서비스 제공을 위해 아래와 같이 처리를 위탁하고 있으며, 위탁 업무 범위를 넘어 개인정보를 이용하지 않도록 관리합니다.</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-3 py-2">수탁자</th>
                <th className="border border-slate-300 px-3 py-2">위탁 업무</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2">Supabase</td>
                <td className="border border-slate-300 px-3 py-2">데이터베이스 저장·관리</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2">Vercel</td>
                <td className="border border-slate-300 px-3 py-2">웹 서비스 호스팅·운영</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2">Resend</td>
                <td className="border border-slate-300 px-3 py-2">이메일 발송</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2">Solapi(솔라피)</td>
                <td className="border border-slate-300 px-3 py-2">카카오 알림톡·문자 발송</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600">일부 수탁자는 국외 서버에서 정보를 처리·보관할 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="6. 파기 절차 및 방법">
        <LegalList
          items={[
            '보유 기간이 끝났거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.',
            '전자적 파일 형태의 정보는 복구할 수 없는 방법으로 삭제하거나 개인 식별 정보를 제거(익명화)합니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 이용자의 권리와 행사 방법">
        <LegalList
          items={[
            '언제든지 개인정보의 열람·정정·삭제·처리정지와 수신 동의의 철회를 요청하실 수 있습니다.',
            '매거진(이메일·알림톡) 하단의 수신거부 링크로 직접 수신을 거부하실 수 있습니다.',
            <>
              열람·삭제 등 요청 연락처: {contact}
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="8. 만 14세 미만 아동">
        <p>서비스는 만 14세 미만 아동의 구독을 받지 않습니다. 구독 신청 시 만 14세 이상임을 확인하며, 만 14세 미만으로 확인되는 경우 정보를 삭제합니다.</p>
      </LegalSection>

      <LegalSection title="9. 안내의 변경">
        <p>
          이 안내의 내용이 변경되는 경우 서비스 내 공지 등을 통해 알려드립니다. 매거진 구독 이용 조건은{' '}
          <Link href="/terms" className="font-medium text-blue-700 underline underline-offset-2">
            매거진 구독 이용약관
          </Link>
          에서 확인하실 수 있습니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
