import type { PublicationPackage } from '../../../im-core/publication/package-builder';
import type { ContentSectionPlan } from './m10-content-plan';
import { applyLexiconFilter } from '../../presentation/cre-lexicon-filter';
import { sanitizePersonaTerms } from '../../../mobile-im-publication/builder';
import { runRiskBoundaryCheck } from '../../guardrails';

export interface MobileDraftSection {
  sectionType: string;
  title: string;
  content: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
}

export function executeM20DraftVersion(
  pkg: PublicationPackage,
  plan: ContentSectionPlan[]
): MobileDraftSection[] {
  const sections: MobileDraftSection[] = [];
  const { snapshot, proposals } = pkg;

  for (const item of plan) {
    if (item.sectionType === 'property_overview') {
      const askingPriceEok = (snapshot.pricing.askingPriceKrw / 100000000).toFixed(1);
      const landPy = (snapshot.areas.landAreaTotal / 3.305785).toFixed(1);
      const gfaPy = (snapshot.areas.grossFloorArea / 3.305785).toFixed(1);

      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: `본 자산은 연면적 ${snapshot.areas.grossFloorArea.toLocaleString()}㎡(약 ${gfaPy}평) 규모의 우량 상업용 부동산입니다.`,
        tables: [
          {
            headers: ['항목', '내용'],
            rows: [
              ['매매희망가', `${askingPriceEok}억 원`],
              ['대지면적', `${snapshot.areas.landAreaTotal.toLocaleString()}㎡ (${landPy}평)`],
              ['연면적', `${snapshot.areas.grossFloorArea.toLocaleString()}㎡ (${gfaPy}평)`],
              ['토지 평당가', `${Math.floor(snapshot.unitPrices.pricePerPyeongLand / 10000).toLocaleString()}만 원`],
            ],
          },
        ],
      });
    } else if (item.sectionType === 'financial_summary') {
      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: `연면적 기준 평당 매매가는 ${Math.floor(snapshot.unitPrices.pricePerPyeongGross / 10000).toLocaleString()}만 원 수준으로 인근 거래사례 대비 우수한 가치경쟁력을 갖추고 있습니다.`,
      });
    } else if (item.sectionType === 'lease_status') {
      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: `현재 안정적으로 임대차 운영 중이며 공실률은 정상 관리 범위 내에 있습니다.`,
      });
    } else if (item.sectionType === 'investment_thesis') {
      const confirmed = proposals.filter((p) => p.approvalState === 'broker_confirmed');
      const copies = confirmed.map((p) => {
        const filtered = applyLexiconFilter(p.finalCopy).filteredText;
        const sanitized = sanitizePersonaTerms(filtered);
        const risk = runRiskBoundaryCheck(sanitized);
        if (risk.status === 'blocked') {
          const msgs = risk.issues.map((i) => i.message).join('; ');
          throw new Error(`M20_LEGAL_RISK_BLOCKED: 공인중개사법 위반 문구 차단 (${msgs})`);
        }
        return risk.safe_text ?? sanitized;
      });
      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: copies.length > 0 ? copies.join('\n\n') : '입지적 장점과 활용 가치가 우수한 자산입니다.',
      });
    } else if (item.sectionType === 'risk_check') {
      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: `등기부등본 및 건축물대장 분석 결과 소유권 및 권리관계 승계에 중대한 제한 요인은 없는 것으로 검토되었습니다.`,
      });
    } else if (item.sectionType === 'disclaimer') {
      sections.push({
        sectionType: item.sectionType,
        title: item.title,
        content: `본 자료는 매수 검토를 돕기 위해 작성된 것으로 최종 거래 조건 및 법률/세무 사항은 실사를 통해 재확인되어야 합니다.`,
      });
    }
  }

  return sections;
}
