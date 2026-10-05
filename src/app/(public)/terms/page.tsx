import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONFIRM_TTL_DAYS_TEXT,
  LegalList,
  LegalPage,
  LegalSection,
  RECONFIRM_YEARS_TEXT,
  getPrivacyContactText,
} from '../privacy/legal-shared';

export const metadata: Metadata = {
  title: '매거진 구독 이용약관 | CRE DealCard 매거진',
  description: '매거진 구독 신청·확인, 광고성 정보 수신 동의와 해지 방법, 정보 이용상의 유의사항을 안내합니다.',
};

// 주의(코드 주석): 법무 검토 전 초안. 검토 필요 사항은 docs/magazine/audit-2026-10-04/legal-review-needed.md 참조.

export default function TermsPage() {
  const contact = getPrivacyContactText();
  return (
    <LegalPage title="매거진 구독 이용약관">
      <LegalSection title="제1조 (목적)">
        <p>
          이 약관은 CRE DealCard(credeal.net, 이하 &quot;서비스&quot;)가 제공하는 상업용 부동산 정보 매거진(이하 &quot;매거진&quot;)의 구독 신청·이용과
          관련하여 서비스와 구독자의 권리·의무 및 기본 사항을 정함을 목적으로 합니다.
        </p>
      </LegalSection>

      <LegalSection title="제2조 (서비스 내용)">
        <p>
          매거진은 구독자가 선택한 발행 중개사의 이름으로 지역 시장 동향, 매물·세무·시장 정보 등을 이메일 또는 카카오 알림톡으로
          정기적으로 전달하는 서비스입니다. 발송 주기와 구성은 운영 사정에 따라 달라질 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제3조 (구독 신청과 확인)">
        <LegalList
          items={[
            '구독은 만 14세 이상이 신청할 수 있으며, 신청 시 개인정보 수집·이용 및 광고성 정보 수신에 동의하셔야 합니다.',
            <>
              신청 후 이메일로 발송되는 확인 링크에서 &quot;구독 확인하기&quot; 버튼을 눌러야 구독이 완료됩니다. 확인 링크는 신청 후{' '}
              {CONFIRM_TTL_DAYS_TEXT} 동안 유효하며, 확인이 완료되기 전에는 매거진을 발송하지 않습니다.
            </>,
            '이메일 주소가 없는 신청(카카오 전용 등)은 현재 확인 링크를 보낼 수 없어 구독 확인이 완료되지 않을 수 있으며, 이 경우 매거진은 발송되지 않습니다. 이메일 주소를 함께 입력해 다시 신청해 주세요.',
            '타인의 연락처를 이용한 신청은 금지되며, 본인이 신청하지 않은 확인 메일은 무시하시면 됩니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="제4조 (광고성 정보 수신)">
        <LegalList
          items={[
            '매거진에는 광고성 정보가 포함될 수 있으며, 이메일 제목과 알림톡 본문에 “(광고)”를 표시하고 발신자(발행 중개사)의 명칭과 연락처, 수신거부 방법을 함께 안내합니다.',
            '야간(오후 9시~오전 8시) 시간대의 광고성 정보는 별도로 동의하신 경우에만 발송합니다.',
            <>
              수신 동의는 동의일로부터 {RECONFIRM_YEARS_TEXT}마다 수신 의사를 다시 확인하며, 확인되지 않으면 발송이 중단될 수 있습니다.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="제5조 (수신거부·구독 해지)">
        <LegalList
          items={[
            '구독자는 언제든지 매거진(이메일·알림톡) 하단의 수신거부 링크로 구독을 해지할 수 있습니다.',
            <>
              링크를 사용할 수 없는 경우 아래 연락처로 해지를 요청하실 수 있습니다: {contact}
            </>,
            '해지하시면 이후 매거진이 발송되지 않으며, 해지 후 보유·파기에 관한 사항은 개인정보 수집·이용 안내를 따릅니다.',
            '해지 이후 다시 구독하시려면 구독 신청과 확인 절차를 처음부터 진행하셔야 합니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="제6조 (정보의 성격과 이용상의 유의)">
        <LegalList
          items={[
            '매거진의 시장 동향·가격·세무·법률 관련 내용은 일반적인 참고 정보이며 투자·거래·세무·법률 자문이 아닙니다.',
            '정보의 정확성과 최신성을 위해 노력하나 이를 보증하지 않으며, 구독자는 실제 거래나 의사결정 전에 별도로 사실관계를 확인하고 필요한 경우 전문가의 자문을 받으셔야 합니다.',
            '매거진에 소개되는 매물·조건은 변경되거나 종료될 수 있습니다.',
          ]}
        />
      </LegalSection>

      <LegalSection title="제7조 (서비스의 변경·중단)">
        <p>
          서비스는 운영상·기술상 필요에 따라 매거진의 내용, 발송 주기, 발송 채널을 변경하거나 일시 중단할 수 있으며, 중요한 변경은 서비스 내 공지 등으로
          알립니다.
        </p>
      </LegalSection>

      <LegalSection title="제8조 (책임의 제한)">
        <p>
          서비스는 천재지변, 통신·외부 발송 사업자의 장애 등 불가항력으로 인한 발송 지연·누락에 대해 책임을 지지 않습니다. 다만 서비스의 고의 또는 중대한
          과실이 있는 경우는 예외로 합니다.
        </p>
      </LegalSection>

      <LegalSection title="제9조 (약관의 변경)">
        <p>
          약관이 변경되는 경우 시행일 전에 서비스 내 공지 등으로 알리며, 변경 후에도 구독을 유지하는 것은 변경된 약관에 동의하는 것으로 봅니다. 동의하지
          않으시면 언제든 구독을 해지하실 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제10조 (개인정보의 보호)">
        <p>
          구독자의 개인정보는{' '}
          <Link href="/privacy" className="font-medium text-blue-700 underline underline-offset-2">
            개인정보 수집·이용 안내
          </Link>
          에 따라 처리됩니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
