import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ANALYTICS_EVENT_RETENTION_NOTICE,
  COMPANY_LEGAL_CONFIG,
  CONFIRM_TTL_DAYS_TEXT,
  LegalContextNav,
  LegalList,
  LegalPage,
  LegalSection,
  RECONFIRM_YEARS_TEXT,
  RETENTION_EVENTS_DAYS,
  RETENTION_UNSUBSCRIBED_DAYS,
  SUBSCRIBER_RETENTION_LEGAL_NOTE,
  SUBSCRIBER_RETENTION_NOTICE,
  VISITOR_ID_RETENTION_NOTICE,
  getPrivacyContactText,
} from '../terms/legal-shared';

export const metadata: Metadata = {
  title: '개인정보처리방침 및 수집·이용 안내 | 크리딜 (CREDEAL)',
  description:
    '크리딜 (CREDEAL) 중개사 회원, 딜카드/IM 열람·문의 고객, 매거진 구독자의 개인정보 수집 항목, 이용 목적, 보유 기간, 처리위탁·국외이전 및 정보주체 권리를 안내합니다.',
};

// 보유기간 수치는 retention-purge(마이그레이션 000014 + /api/cron/retention-purge)와 일치해야 한다 — legal-shared.tsx 주석 참고.

export default function PrivacyPage() {
  const contact = getPrivacyContactText();
  return (
    <LegalPage title="개인정보처리방침 및 수집·이용 안내">
      {/* 상단: 상황별 복귀 내비게이션(48px 높이) + 큰 글씨 핵심 3줄 요약 상자 */}
      <div className="space-y-4">
        <LegalContextNav current="privacy" />

        <section
          aria-label="핵심 3줄 요약"
          className="rounded-2xl border-2 border-blue-200 bg-white p-5 text-slate-900 shadow-sm space-y-3"
        >
          <h2 className="text-[18px] font-bold leading-snug text-slate-900">
            한눈에 보는 개인정보 안내 핵심 3줄 요약
          </h2>
          <ul className="space-y-2 text-[16px] leading-[1.75] text-slate-800">
            <li>
              ① <strong>회원·문의·구독 정보는 서비스 제공과 매거진 발송에만 사용</strong>하며 제3자에게 무단 판매하거나 넘기지 않습니다.
            </li>
            <li>
              ② <strong>매거진은 언제든 &apos;수신 거부&apos; 한 번으로 해지 가능하며 30일 뒤 파기</strong>({SUBSCRIBER_RETENTION_NOTICE})됩니다.
            </li>
            <li>
              ③ <strong>쿠키나 기기 지문 없이 안전한 통계만 사용</strong>(브라우저 임의 방문자 번호 {VISITOR_ID_RETENTION_NOTICE}, 서버 통계{' '}
              {ANALYTICS_EVENT_RETENTION_NOTICE})합니다.
            </li>
          </ul>
        </section>
      </div>

      <p className="text-[17px] leading-[1.85] text-slate-800">
        {COMPANY_LEGAL_CONFIG.serviceName}({COMPANY_LEGAL_CONFIG.domain}, 운영 주체: {COMPANY_LEGAL_CONFIG.companyName}, 이하 &quot;서비스&quot;)은
        「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이
        개인정보처리방침을 수립·공개합니다. 동의를 거부하실 권리가 있으나, 각 서비스의 필수 항목에 동의하지 않으시면 회원가입·문의 접수 또는
        매거진 구독이 제한됩니다.
      </p>

      <LegalSection title="1. 정보주체 유형별 수집하는 개인정보 항목 및 이용 목적">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-[18px] font-bold text-slate-900">① 중개사 회원 (B2B SaaS 워크스페이스 이용자)</h3>
            <LegalList
              items={[
                <>
                  <strong>필수 항목</strong>: 이름(표시명), 이메일 주소, 비밀번호(일방향 암호화 저장), 계정 권한 구분, 필수 약관·개인정보 동의 일시 및
                  동의 버전({COMPANY_LEGAL_CONFIG.consentVersion})
                </>,
                <>
                  <strong>선택 항목(중개사 프로필·명함 설정 시)</strong>: 중개사무소 상호, 대표 전화번호, 개설등록번호, 프로필 사진, 전문 권역·소개문,
                  선택 마케팅·업데이트 수신 동의 여부
                </>,
                <>
                  <strong>이용 목적</strong>: 회원 식별 및 본인 인증(PKCE 비밀번호 재설정 포함), 딜카드·IM·뉴스레터 발행자 법정 명함 표기, 고객 문의 알림
                  연결, 서비스 공지 및 보안 관리
                </>,
              ]}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-[18px] font-bold text-slate-900">② 딜카드 / IM 열람·문의 고객 (매수·임차 관심 고객)</h3>
            <LegalList
              items={[
                <>
                  <strong>필수 항목(문의·열람 승인 요청 시)</strong>: 이름(또는 소속·직함), 연락처(휴대전화번호 또는 이메일 주소), 문의 내용, 관심 매물
                  식별자, 기밀유지(NDA)·개인정보 수집 동의 일시
                </>,
                <>
                  <strong>이용 목적</strong>: 블라인드 매물 상세 자료 열람 승인 심사, 담당 발행 중개사 소통함 전달 및 상담 회신, 무단 열람·악용 방지
                </>,
              ]}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-[18px] font-bold text-slate-900">③ 매거진(뉴스레터) 구독자</h3>
            <LegalList
              items={[
                <>
                  <strong>필수 항목</strong>: 수신 채널에 따른 연락처 — 휴대전화번호(카카오 알림톡 수신 시) 또는 이메일 주소(이메일 수신 시)
                </>,
                <>
                  <strong>선택 항목</strong>: 이름(호칭), 관심 지역·자산 유형 태그, 야간(오후 9시~오전 8시) 광고성 정보 수신 동의 여부
                </>,
                <>
                  <strong>동의 기록 및 자동 생성 정보</strong>: 개인정보 수집·이용 및 광고성 정보 수신 동의 일시·버전·동의 경로, 만 14세 이상 확인 여부,
                  접속 IP의 해시값(원문 IP는 저장하지 않습니다), 매거진 열람·클릭 이력(브라우저 임의 방문자 번호를{' '}
                  <strong>{VISITOR_ID_RETENTION_NOTICE}</strong> — 이름·연락처와 직접 연결하지 않는 1st-party ID 사용)
                </>,
                <>
                  <strong>이용 목적</strong>: 구독 확인 링크 발송 및 정기 매거진(이메일·카카오 알림톡) 발송, 수신 동의·철회 이력 관리 및 주기적 재확인,
                  관심 지역·자산 유형 맞춤 콘텐츠 구성 및 통계 분석
                </>,
              ]}
            />
          </div>
        </div>
      </LegalSection>

      <LegalSection title="2. 개인정보의 보유 및 이용 기간">
        <LegalList
          items={[
            <>
              <strong>중개사 회원 개인정보</strong>: 회원 탈퇴 시 지체 없이 파기합니다. 다만 부정이용 방지 및 관계 법령(전자상거래 등에서의 소비자보호에
              관한 법률, 통신비밀보호법 등)에 따라 보존할 필요가 있는 기록은 법정 보존 기간 동안 안전하게 분리 보관 후 파기합니다.
            </>,
            <>
              <strong>딜카드 / IM 열람·문의 고객 정보</strong>: 문의 응대 및 기밀유지(NDA) 증빙 목적 달성 시 또는 삭제 요청 시 지체 없이 파기하며, 관계
              법령상 보존 의무가 있는 경우 해당 법정 기간 동안 보관합니다.
            </>,
            <>
              <strong>매거진 구독자 개인정보</strong>: 구독 중에는 서비스 제공을 위해 보유하며, <strong>{SUBSCRIBER_RETENTION_NOTICE}</strong>합니다 (
              {SUBSCRIBER_RETENTION_LEGAL_NOTE}). 수신을 거부(해지)하시면 해지일로부터 <strong>{RETENTION_UNSUBSCRIBED_DAYS}일이 지난 뒤</strong>{' '}
              이름·휴대전화번호·이메일 주소·동의 IP 해시 등 개인을 식별할 수 있는 정보를 복구할 수 없는 방식으로 익명화(파기)하며, 익명화된 기록에는
              개인을 식별할 수 있는 정보가 남지 않습니다.
            </>,
            <>
              <strong>브라우저 임의 방문자 번호(localStorage)</strong>: <strong>{VISITOR_ID_RETENTION_NOTICE}</strong> 후 만료됩니다.
            </>,
            <>
              <strong>서버 열람 통계 이벤트</strong>: 열람·클릭 이력은 <strong>{ANALYTICS_EVENT_RETENTION_NOTICE}</strong>({RETENTION_EVENTS_DAYS}일
              경과 시 삭제)합니다.
            </>,
            <>
              광고성 정보 수신 동의는 동의일로부터 {RECONFIRM_YEARS_TEXT}마다 수신 의사를 다시 확인하며, 확인하지 않으면 발송이 중단될 수 있습니다.
            </>,
            <>
              구독 확인 링크는 신청 후 {CONFIRM_TTL_DAYS_TEXT} 동안만 유효하며, 확인이 완료되지 않은 신청에는 매거진을 발송하지 않습니다. 확인되지 않은
              신청 정보의 삭제는 아래 연락처로 요청하실 수 있습니다.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 개인정보의 제3자 제공">
        <p>
          서비스는 정보주체의 개인정보를 제1조에서 고지한 수집·이용 목적 범위를 넘어 이용하거나 외부 제3자에게 무단 판매·제공하지 않습니다. 다만 고객이
          특정 발행 중개사의 딜카드/IM 페이지에서 직접 상담·열람 승인을 신청하거나 특정 중개사의 매거진 구독을 선택한 경우, 해당 발행 중개사에게 상담 응대
          및 매거진 발송·구독 관리 목적으로 신청 정보가 연결됩니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 개인정보 처리위탁 및 국외 이전 고지 (개인정보 보호법 제26조·제28조의8)">
        <p>
          서비스는 안정적인 클라우드 인프라 운영, AI 문서 초안 보조 및 이메일·알림 발송을 위하여 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 일부
          수탁사는 국외 클라우드 리전을 통해 데이터를 처리·보관합니다. 위탁 계약 시 개인정보 보호법 제26조에 따라 목적 외 처리 금지, 기술적·관리적 보호조치,
          재위탁 제한 및 안전성 확보 의무를 명확히 규정하여 관리하고 있습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-[15px] text-slate-900">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-900">
                <th className="border border-slate-300 px-3 py-2.5 font-bold">수탁자 (이전받는 자)</th>
                <th className="border border-slate-300 px-3 py-2.5 font-bold">위탁 업무 및 이전 목적</th>
                <th className="border border-slate-300 px-3 py-2.5 font-bold">처리 국가·리전 및 이전 방법</th>
                <th className="border border-slate-300 px-3 py-2.5 font-bold">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {COMPANY_LEGAL_CONFIG.processors.map((proc) => (
                <tr key={proc.id}>
                  <td className="border border-slate-300 px-3 py-2.5 font-semibold">{proc.name}</td>
                  <td className="border border-slate-300 px-3 py-2.5">{proc.purpose}</td>
                  <td className="border border-slate-300 px-3 py-2.5">
                    {proc.region} ({proc.transferMethod})
                  </td>
                  <td className="border border-slate-300 px-3 py-2.5">{proc.retentionPeriod}</td>
                </tr>
              ))}
              <tr>
                <td className="border border-slate-300 px-3 py-2.5 font-semibold">(주)솔라피 (Solapi)</td>
                <td className="border border-slate-300 px-3 py-2.5">카카오 알림톡 및 문자메시지 발송 연동</td>
                <td className="border border-slate-300 px-3 py-2.5">대한민국 (암호화 API 전송)</td>
                <td className="border border-slate-300 px-3 py-2.5">발송 이력 보관 기간 또는 위탁 계약 종료 시까지</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[15px] text-slate-700">
          정보주체는 개인정보 보호책임자({COMPANY_LEGAL_CONFIG.privacyContactEmail})에게 연락하여 국외 이전을 거부하실 수 있습니다. 다만 서비스 핵심
          클라우드·이메일 인프라와 연동된 필수 처리의 국외 이전을 거부하시는 경우 회원가입 또는 이메일 발송 등 서비스 이용이 제한될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 파기 절차 및 방법">
        <LegalList
          items={[
            '보유 기간이 끝났거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.',
            '전자적 파일 형태의 정보는 복구·재생할 수 없는 기술적 방법으로 영구 삭제하거나 개인 식별 정보를 비가역적으로 제거(익명화)합니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. 정보주체의 권리와 행사 방법">
        <LegalList
          items={[
            '정보주체는 언제든지 본인의 개인정보에 대한 열람·정정·삭제·처리정지 요구 및 수집·이용·마케팅 수신 동의 철회를 행사할 수 있습니다.',
            '중개사 회원은 워크스페이스 내 프로필 설정 화면 또는 고객지원을 통해 직접 정보를 열람·수정하거나 회원 탈퇴를 요청할 수 있습니다.',
            '매거진 구독자는 이메일·알림톡 하단의 수신거부 링크를 통해 즉시 수신을 거부할 수 있습니다.',
            <>열람·정정·삭제·처리정지 요청 창구: {contact}</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 만 14세 미만 아동의 개인정보 보호">
        <p>
          서비스는 만 14세 미만 아동의 회원가입 및 매거진 구독을 받지 않습니다. 가입 및 구독 신청 시 만 14세 이상임을 확인하며, 만 14세 미만 아동의 정보가
          접수된 사실이 확인되는 경우 지체 없이 해당 정보를 삭제합니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 개인정보보호책임자 및 권익침해 구제방법">
        <LegalList
          items={[
            <>
              <strong>개인정보보호책임자</strong>: {COMPANY_LEGAL_CONFIG.privacyOfficerName}
            </>,
            <>
              <strong>개인정보 보호 및 열람청구 담당 연락처</strong>: {COMPANY_LEGAL_CONFIG.privacyContactEmail} (일반 고객지원:{' '}
              {COMPANY_LEGAL_CONFIG.supportEmail})
            </>,
            '기타 개인정보 침해에 대한 신고나 상담이 필요하신 경우 개인정보분쟁조정위원회(1833-6972, kopico.go.kr), 개인정보침해신고센터(국번없이 118, privacy.kisa.or.kr), 대검찰청(국번없이 1301), 경찰청(국번없이 182)에 문의하실 수 있습니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="9. 개인정보처리방침의 변경">
        <p>
          이 개인정보처리방침은 <strong>{COMPANY_LEGAL_CONFIG.effectiveDate}</strong>부터 적용됩니다. 법령·정책 또는 보안기술의 변경에 따라 내용의 추가·삭제
          및 수정이 있을 때에는 시행일 전에 서비스 내 공지 등을 통해 안내합니다. 서비스 전반의 이용 조건은{' '}
          <Link href="/terms" className="font-bold text-blue-800 underline underline-offset-2">
            통합 서비스 이용약관
          </Link>
          에서 확인하실 수 있습니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
