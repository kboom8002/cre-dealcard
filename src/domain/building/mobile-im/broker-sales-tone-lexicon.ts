/**
 * @file src/domain/building/mobile-im/broker-sales-tone-lexicon.ts
 * @description 선임 중개사 자연스러운 한국어 영업 화법 사전 및 매수 성격별 Few-Shot 예시.
 *   딱딱한 외래어·학술 용어를 40~60대 한국 CRE 현장 화법으로 순화하되,
 *   모든 숫자(금액·면적·수익률)·고유 임차인 상호·마크다운 표 행은 100% 원형 보존한다.
 */

export type SeniorBrokerPostureKey = '임대수익용' | '사옥용' | '신축·개발용';

export const SENIOR_BROKER_POSTURE_FEW_SHOTS: Record<
  SeniorBrokerPostureKey,
  readonly { title: string; body: string }[]
> = {
  임대수익용: [
    {
      title: '대로변 공실 우려 적은 꾸준한 월세 구조',
      body: '주변 배후 수요가 탄탄해 임차인이 자주 바뀌지 않고 매달 안정적인 월세 현금흐름을 기대할 수 있습니다.',
    },
    {
      title: '인근 시세 대비 부담 적은 매입 단가',
      body: '유사 규모 매각 사례와 비교해 평당 매입 부담이 낮아 향후 금리 변동에도 수익 여력이 견고합니다.',
    },
  ],
  사옥용: [
    {
      title: '임직원 출퇴근·손님 방문 편한 역세권 단독 건물',
      body: '대중교통 접근성과 건물 전면 가시성이 뛰어나 법인 사옥이나 병의원·디자인 스튜디오 직영 건물로 손색없습니다.',
    },
    {
      title: '명도 일정 협의 가능한 깔끔한 설비 상태',
      body: '주요 설비 관리가 잘 되어 있어 큰 추가 수선비 부담 없이 입주 시기를 계획대로 맞추기 좋습니다.',
    },
  ],
  '신축·개발용': [
    {
      title: '용적률 여유로 신축·증축 가치가 큰 코너 필지',
      body: '현행 연면적 대비 남은 건축 여력이 넉넉해 외관 리모델링이나 신축을 통한 건물 가치 상승이 유망합니다.',
    },
    {
      title: '우량 업종 재구성 시 임대수익 개선 여력 풍부',
      body: '상권 유동인구에 맞는 업종으로 층별 구성을 다듬으면 향후 매각 시 자본차익 확보까지 노려볼 수 있습니다.',
    },
  ],
};

const TONE_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replaceWith: string }> = [
  { pattern: /자본적\s*지출\s*\(\s*CapEx\s*\)/gi, replaceWith: '추가 수선비' },
  { pattern: /\bCapEx\b/gi, replaceWith: '추가 수선비' },
  { pattern: /리테넌팅\s*\(\s*Re-?tenanting\s*\)/gi, replaceWith: '우량 업종 재구성' },
  { pattern: /리테넌팅/g, replaceWith: '우량 업종 재구성' },
  { pattern: /향후\s*매각\s*\(\s*Exit\s*\)/gi, replaceWith: '향후 매각' },
  { pattern: /익시트\s*\(\s*Exit\s*\)/gi, replaceWith: '향후 매각' },
  { pattern: /\bExit\s*전략/gi, replaceWith: '향후 매각 전략' },
  { pattern: /금리\s*스프레드/g, replaceWith: '금리 대비 수익 여유' },
  { pattern: /효과\s*시현/g, replaceWith: '효과 확보' },
  { pattern: /수익\s*시현/g, replaceWith: '수익 확보' },
  { pattern: /신축·밸류업/g, replaceWith: '신축·리모델링' },
  { pattern: /밸류업\s*여지/g, replaceWith: '건축·수익 개선 여지' },
  { pattern: /밸류업/g, replaceWith: '가치 개선' },
];

/**
 * 딱딱한 외래어·번역투 금융 용어를 선임 한국 중개사 화법으로 순화한다.
 * 숫자·단위(㎡/평/억/만원/%)·브랜드·마크다운 표 행(`| ... |`)은 변경하지 않는다.
 */
export function humanizeSeniorBrokerTone(raw: string): string {
  if (!raw) return raw;
  const lines = raw.split('\n');
  const nextLines = lines.map((line) => {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      return line;
    }
    const leadingMatch = line.match(/^[ \t]*/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    let body = line.slice(leading.length);
    for (const rule of TONE_REPLACEMENTS) {
      body = body.replace(rule.pattern, rule.replaceWith);
    }
    body = body.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '');
    return `${leading}${body}`;
  });
  return nextLines.join('\n');
}
