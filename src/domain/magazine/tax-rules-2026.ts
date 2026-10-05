/**
 * src/domain/magazine/tax-rules-2026.ts — 세무 클리닉이 인용할 수 있는 법령 사실의 **유일한 출처** (C-02, M2-15, DC-13)
 *
 * 원칙
 *  - 세율·공제·기간 등 숫자는 이 파일에서만 가져온다. LLM이 숫자를 생성하지 않는다(생성기 QG가 이 파일 밖 숫자를 차단).
 *  - 모든 사실은 근거 조문(ref)과 기준일(TAX_RULES_AS_OF)을 가진다. 법 개정 시 이 파일만 수정한다.
 *  - 이 값들은 **세무 전문가의 검수를 거치지 않았다**(reviewStatus). 독자에게는 "일반 정보이며 세무 자문이 아닙니다" 면책과
 *    기준일을 함께 표시하고, "감수" 표현은 실제 감수자·감수일 메타데이터가 생기기 전까지 사용하지 않는다(T3-02, T3-LLM-1).
 *  - 국가법령정보센터(law.go.kr)에서 기준일 이후 개정 여부를 확인한 뒤 TAX_RULES_AS_OF 를 갱신할 것.
 */

/** 규정 기준 연도 (귀속연도). */
export const TAX_RULES_YEAR = 2026;
/** 이 파일의 사실을 마지막으로 확인한 기준일. 개정 확인 후 갱신. */
export const TAX_RULES_AS_OF = '2026-01-01';

/** 전문가 검수 상태 — 'UNREVIEWED' 인 동안 UI/문구에 "감수"를 쓰지 않는다. */
export const TAX_RULES_REVIEW_STATUS: 'UNREVIEWED' | 'REVIEWED' = 'UNREVIEWED';

/** 독자 노출 면책 문구 (12px 이상, 대비 4.5:1 이상으로 표시할 것 — P0-05). */
export const TAX_DISCLAIMER =
  '일반 정보이며 세무 자문이 아닙니다. 실제 세금은 취득가액·보유기간·가족관계·소득 상황 등에 따라 달라지므로 실행 전 세무 전문가와 상담하시기 바랍니다.';

export interface TaxFact {
  /** LLM에 그대로 제공되는 사실 문장 (숫자 포함 가능, 이 문장의 숫자만 출력에서 허용) */
  text: string;
  /** 근거 조문 */
  ref: string;
}

export interface TaxTopic {
  id: string;
  title: string;
  /** 두 대안(비교 축). LLM은 이 이름을 그대로 쓴다. */
  optionAName: string;
  optionBName: string;
  facts: readonly TaxFact[];
  /** 누락하면 오해가 생기는 전제 — 반드시 결론에 언급 (M2-15) */
  mustMention: readonly string[];
}

export const TAX_TOPICS: readonly TaxTopic[] = [
  {
    id: 'gift-then-sell',
    title: '증여 후 매각 vs 직접 매각',
    optionAName: '직접 매각 후 현금 증여',
    optionBName: '자녀에게 증여 후 자녀가 매각',
    facts: [
      {
        text: '배우자 또는 직계존비속에게 증여받은 부동산을 증여일부터 10년 이내에 양도하면 이월과세가 적용되어, 양도차익은 증여자의 취득가액을 기준으로 계산합니다.',
        ref: '소득세법 제97조의2',
      },
      {
        text: '증여세 과세표준이 1억원 이하이면 10%, 1억원 초과 5억원 이하이면 20%, 5억원 초과 10억원 이하이면 30%, 10억원 초과 30억원 이하이면 40%, 30억원 초과이면 50%의 누진세율을 적용합니다.',
        ref: '상속세 및 증여세법 제26조, 제56조',
      },
      {
        text: '부동산 양도소득세는 보유기간 1년 이상 2년 미만이면 40%, 1년 미만이면 50%의 단기 양도 세율이 적용될 수 있고, 2년 이상이면 6%에서 45%의 기본세율이 적용됩니다.',
        ref: '소득세법 제104조',
      },
    ],
    mustMention: ['증여 후 10년 이내 양도 시 이월과세 적용 여부'],
  },
  {
    id: 'burdened-gift',
    title: '부담부 증여(임대보증금·대출 승계)',
    optionAName: '전액 증여',
    optionBName: '부담부 증여',
    facts: [
      {
        text: '수증자가 증여재산에 담보된 채무(임대보증금·대출 등)를 인수하면 그 채무액에 해당하는 부분은 유상 양도로 보아 증여자에게 양도소득세가 과세되고, 나머지 부분에 대해 수증자에게 증여세가 과세됩니다.',
        ref: '상속세 및 증여세법 제47조 제3항, 소득세법 제88조',
      },
      {
        text: '증여세 과세표준이 1억원 이하이면 10%, 1억원 초과 5억원 이하이면 20%, 5억원 초과 10억원 이하이면 30%, 10억원 초과 30억원 이하이면 40%, 30억원 초과이면 50%의 누진세율을 적용합니다.',
        ref: '상속세 및 증여세법 제26조, 제56조',
      },
    ],
    mustMention: ['채무 인수분은 증여자에게 양도소득세가 과세된다는 점'],
  },
  {
    id: 'joint-ownership',
    title: '공동명의와 양도소득세',
    optionAName: '단독명의 보유',
    optionBName: '공동명의 보유',
    facts: [
      {
        text: '양도소득세는 소유자별로 각각 과세되므로 공동명의이면 양도차익이 지분별로 나뉘어 소유자마다 누진세율이 따로 적용되고, 양도소득 기본공제(연 250만원)도 소유자별로 적용됩니다.',
        ref: '소득세법 제92조, 제103조, 제104조',
      },
      {
        text: '부동산 양도소득세 기본세율은 과세표준 1,400만원 이하 6%부터 10억원 초과 45%까지 8단계 누진세율입니다.',
        ref: '소득세법 제104조 제1항',
      },
      {
        text: '배우자 간 증여는 10년간 6억원까지 증여재산공제가 적용되며, 공동명의를 위한 지분 증여도 증여에 해당하고 이후 이월과세 대상이 될 수 있습니다.',
        ref: '상속세 및 증여세법 제53조, 소득세법 제97조의2',
      },
    ],
    mustMention: ['지분 증여로 공동명의를 만들면 증여세와 이월과세(10년) 검토가 필요하다는 점'],
  },
  {
    id: 'corporate-transfer',
    title: '개인 소유 건물의 법인 전환',
    optionAName: '개인 명의 유지',
    optionBName: '법인 전환',
    facts: [
      {
        text: '개인사업자가 사업용 자산을 현물출자하여 법인으로 전환할 때 양도소득세를 이월과세하는 특례는 부동산임대업과 부동산공급업에는 적용되지 않습니다.',
        ref: '조세특례제한법 제32조, 같은 법 시행령 제29조',
      },
      {
        text: '법인이 부동산을 취득하면 취득세 중과 등 별도의 세 부담이 생길 수 있어 개별 사안별 검토가 필요합니다.',
        ref: '지방세법 제13조',
      },
    ],
    mustMention: ['부동산임대업은 법인전환 이월과세 특례 대상이 아니라는 점'],
  },
  {
    id: 'inheritance-valuation',
    title: '상속·증여 재산의 평가 방법',
    optionAName: '시가(매매·감정가액) 기준 평가',
    optionBName: '기준시가 등 보충적 평가',
    facts: [
      {
        text: '상속·증여재산은 평가기준일 현재의 시가로 평가하는 것이 원칙이며, 시가를 산정하기 어려운 경우에 기준시가 등 보충적 방법으로 평가합니다.',
        ref: '상속세 및 증여세법 제60조, 제61조',
      },
      {
        text: '평가기준일 전후 일정 기간 이내의 매매가액·감정가액·수용가액·경매가액이 확인되면 이를 시가로 보며, 과세관청이 감정평가를 의뢰해 평가하는 경우도 있어 납세자가 평가 방법을 자유롭게 고를 수 있는 것은 아닙니다.',
        ref: '상속세 및 증여세법 시행령 제49조',
      },
    ],
    mustMention: ['평가 방법은 납세자가 임의로 선택하는 것이 아니라 시가 우선 원칙이라는 점'],
  },
] as const;

/** 주차 라벨(예: 'W41-2026')로 주제를 결정적으로 선택 — Math.random 금지, 같은 주에는 모든 브로커가 같은 주제. */
export function pickTaxTopic(weekLabel: string): TaxTopic {
  let h = 0;
  for (let i = 0; i < weekLabel.length; i++) h = (h * 31 + weekLabel.charCodeAt(i)) >>> 0;
  return TAX_TOPICS[h % TAX_TOPICS.length];
}

/** 독자 노출 근거 표기 (감수 표현 없음). */
export function taxSourceLabel(topic: TaxTopic): string {
  const refs = Array.from(new Set(topic.facts.map((f) => f.ref)));
  return `${refs.join(' · ')} (${TAX_RULES_AS_OF} 기준 법령, 개정 시 달라질 수 있음)`;
}
