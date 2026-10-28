/**
 * @file studio-overrides-applier.ts
 * @description Basic IM Studio에서 편집한 테마·슬라이드 순서·표시 여부·텍스트/수치 오버라이드를
 * MobileImPptxRenderer의 theme, sequence, dataMap에 무결하게 반영하는 어댑터.
 *
 * 일반 파이프라인(_studio* 필드가 없을 때)에는 일절 관여하지 않아 골든 테스트 불변성을 100% 보장합니다.
 */
import { PPTX_PRESET_TEMPLATES, PRIME_TEMPLATE_ALIASES, type PptxThemeTokens } from './pptx-theme';
import { applyBasicBrand } from './brand-skin';
import type { SlideSpec } from './deck-sequencer';
import { buildBrokerCompsData } from './broker-extras-slides';
import { bindRentRollTable } from './binder/rent-roll-table-builder';

const PALETTE_KEYS: ReadonlyArray<keyof PptxThemeTokens> = [
  'ink', 'ink2', 'ink3', 'body', 'line', 'line2', 'bg', 'tint',
  'accent', 'accentD', 'accentL', 'accentT', 'accentSoft',
  'green', 'greenL', 'red', 'redL', 'amber', 'amberL', 'blue', 'blueL', 'violet', 'violetL',
  'darkCard', 'darkBlock', 'darkBorder', 'darkBody', 'darkMute', 'darkFaint',
  'darkAccentBg', 'darkAccentBorder', 'darkAccentText',
];

const STUDIO_KEY_TO_DECK_KEY: Record<string, string> = {
  cover: 'cover',
  highlights: 'summary',
  summary: 'summary',
  overview: 'building',
  building: 'building',
  location: 'location',
  land: 'land',
  rentroll: 'rentRoll',
  rentRoll: 'rentRoll',
  yield: 'yieldFormula',
  yieldFormula: 'yieldFormula',
  comps: 'brokerComps',
  brokerComps: 'brokerComps',
  gallery: 'gallery',
  closing: 'closing',
};

export function applyStudioThemeOverrides(
  baseTheme: PptxThemeTokens,
  docBody?: Record<string, any>
): PptxThemeTokens {
  if (!docBody) return baseTheme;
  const themeOv = docBody._studioThemeOverrides;
  const hf = docBody._studioHeaderFooter;
  const coverLayoutType = docBody?._studioSlideTitles?.cover?.layoutType;
  if (!themeOv && !hf && !coverLayoutType) return baseTheme;

  let out: PptxThemeTokens = { ...baseTheme };

  // 1. Visual Preset Palette (supports all Basic & Pro templates in Studio while keeping presetId='credeal_basic' and 맑은 고딕)
  const vp = themeOv?.visualPreset;
  if (vp && typeof vp === 'string' && vp !== 'credeal_basic') {
    const aliasId = PRIME_TEMPLATE_ALIASES[vp] || vp;
    const tpl = PPTX_PRESET_TEMPLATES[vp] || PPTX_PRESET_TEMPLATES[aliasId];
    if (tpl) {
      for (const k of PALETTE_KEYS) {
        if ((tpl as any)[k] !== undefined) {
          (out as any)[k] = (tpl as any)[k];
        }
      }
      // Ensure white-slide background for Basic IM body slides even if a dark template was picked
      if (out.bg !== 'FFFFFF') {
        out.bg = 'FFFFFF';
        out.tint = 'F8FAFC';
        out.body = '1E293B';
        out.ink = tpl.darkCard || '0F172A';
        out.ink2 = tpl.darkBlock || '1E293B';
      }
    }
  }

  // 2. Brand Accent Color override
  if (themeOv?.brandAccent && typeof themeOv.brandAccent === 'string') {
    out = applyBasicBrand({ ...out, presetId: 'credeal_basic' }, themeOv.brandAccent);
  }

  // 3. CoverStyle & LayoutStyle overrides
  if (themeOv?.coverStyle) {
    out.coverStyle = themeOv.coverStyle;
  }
  if (coverLayoutType === 'A01_SPLIT' && (!themeOv?.coverStyle || themeOv.coverStyle === 'institutional_masses')) {
    out.coverStyle = 'split';
  } else if (coverLayoutType === 'A01_HERO' && (!themeOv?.coverStyle || themeOv.coverStyle === 'institutional_masses')) {
    out.coverStyle = 'hero_dark';
  }
  if (themeOv?.layoutStyle) {
    out.layoutStyle = themeOv.layoutStyle;
  }

  // 4. Header & Footer branding overrides
  if (hf) {
    if (hf.companyName) out.companyName = hf.companyName;
    if (hf.companyTagline) out.companyTagline = hf.companyTagline;
    if (hf.logoUrl) out.logoUrl = hf.logoUrl;
    (out as any).headerFooter = { ...hf };
  }

  return out;
}

function parseKoreanCurrencyToKrw(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const parenManMatch = s.match(/\((?:[^)]*?)\b([\d,]+(?:\.\d+)?)\s*만/);
  if (parenManMatch) {
    const n = parseFloat(parenManMatch[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10_000);
  }
  const eokMatch = s.match(/([\d,]+(?:\.\d+)?)\s*억/);
  if (eokMatch) {
    const n = parseFloat(eokMatch[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100_000_000);
  }
  const manMatch = s.match(/([\d,]+(?:\.\d+)?)\s*만/);
  if (manMatch) {
    const n = parseFloat(manMatch[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10_000);
  }
  const plain = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(plain) && plain > 0 ? plain : null;
}

export function applyStudioSlideOverrides(
  sequence: SlideSpec[],
  dataMap: Record<string, any>,
  docBody?: Record<string, any>
): SlideSpec[] {
  if (!docBody) return sequence;
  const rawSlideOverrides = docBody._studioSlideOverrides as Record<string, Record<string, any>> | undefined;
  const initialOverrides = docBody._studioInitialOverrides as Record<string, Record<string, any>> | undefined;
  const slideOverrides = rawSlideOverrides && initialOverrides
    ? Object.fromEntries(
        Object.entries(rawSlideOverrides).map(([dk, ov]) => {
          const init = initialOverrides[dk];
          if (!init || !ov || typeof ov !== 'object') return [dk, ov];
          const diff: Record<string, any> = {};
          for (const [k, v] of Object.entries(ov)) {
            if (!(k in init) || JSON.stringify(init[k]) !== JSON.stringify(v)) {
              diff[k] = v;
            }
          }
          return [dk, diff];
        })
      )
    : rawSlideOverrides;
  const slideTitles = docBody._studioSlideTitles as Record<string, { title?: string; kicker?: string; layoutType?: string }> | undefined;
  const hiddenKeys = docBody._studioHiddenDataKeys as string[] | undefined;
  const slideOrder = docBody._studioSlideOrder as string[] | undefined;
  const hf = docBody._studioHeaderFooter as Record<string, any> | undefined;

  if (!slideOverrides && !slideTitles && !hiddenKeys && !slideOrder && !hf) {
    return sequence;
  }

  // 1. Apply data overrides into dataMap
  if (slideOverrides) {
    const sanitizeStation = (s: string) => s.replace(/([가-힣A-Za-z0-9]+역)\s+([가-힣0-9]+(?:선|라인))역/g, '$1($2)');
    const sanitizeAreaStr = (s: string) => s.replace(/(\d[\d,]*)\.(\d{2})\d+(\s*㎡)/g, '$1.$2$3');
    const heroPts: string[] = Array.isArray(docBody.heroCard?.keyPoints) ? docBody.heroCard.keyPoints : [];
    const brokerPts: string[] = Array.isArray(docBody.broker_extras?.investment_points) ? docBody.broker_extras.investment_points : [];
    const uneditedSummaryPts = new Set([...heroPts, ...brokerPts, docBody.heroCard?.hookText, docBody.heroCard?.keyInvestmentPoint].filter(Boolean).map((x: any) => sanitizeStation(String(x).trim())));
    const isAutoStudioHighlight = (s: string) =>
      /입지 및 안정적 임대수익 구조$/.test(s.trim())
      || /핵심 수익형 빌딩 매각 요약$/.test(s.trim())
      || /·\s*대지\s*[\d,.]+평\s*\/\s*연면적\s*[\d,.]+평$/.test(s.trim())
      || /^현행 수익률\s*[\d.]+%/.test(s.trim())
      || uneditedSummaryPts.has(s.trim());
    // 01 Cover
    const coverOv = slideOverrides['cover'];
    if (coverOv && dataMap['cover']) {
      if (coverOv.title) dataMap['cover'].title = String(coverOv.title);
      if (coverOv.subtitle) dataMap['cover'].subtitle = String(coverOv.subtitle);
      if (coverOv.askingPrice) dataMap['cover'].askingPrice = String(coverOv.askingPrice);
      if (coverOv.address) dataMap['cover'].address = String(coverOv.address);
      if (coverOv.date) dataMap['cover'].documentDate = String(coverOv.date).replace(/-/g, '.');
      if (coverOv.brokerCompany) dataMap['cover'].companyName = String(coverOv.brokerCompany);
      if (coverOv.brokerName) dataMap['cover'].brokerName = String(coverOv.brokerName);
      if (coverOv.brokerPhone) (dataMap['cover'] as any).brokerPhone = String(coverOv.brokerPhone);
    }

    // 02 Summary / Highlights
    const hlOv = slideOverrides['highlights'] || slideOverrides['summary'];
    if (hlOv && dataMap['summary']) {
      if (hlOv.leadSentence || hlOv.keyInvestmentPoint) {
        const candLead = sanitizeStation(String(hlOv.leadSentence || hlOv.keyInvestmentPoint));
        if (!dataMap['summary'].leadSentence || !isAutoStudioHighlight(candLead)) {
          dataMap['summary'].leadSentence = candLead;
        }
      }
      const pts = [
        hlOv.keyInvestmentPoint,
        hlOv.investmentPoint2,
        hlOv.investmentPoint3,
      ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (pts.length > 0) {
        const cleanPts = pts.map(sanitizeStation);
        const existingPts = Array.isArray(dataMap['summary'].keyPoints) ? dataMap['summary'].keyPoints : [];
        if (existingPts.length === 0 || !cleanPts.every(isAutoStudioHighlight)) {
          dataMap['summary'].keyPoints = cleanPts;
        }
      }
      if (hlOv.askingPrice) {
        dataMap['summary'].askingPrice = String(hlOv.askingPrice);
      }

      // Sync edited KPI metrics & heroCard stats on 02 Summary
      const updateSummaryMetric = (labelKeywords: string[], val?: unknown) => {
        if (!val || !String(val).trim() || String(val).trim() === '-') return;
        const cleanVal = sanitizeAreaStr(sanitizeStation(String(val).trim()));
        if (Array.isArray(dataMap['summary'].metrics)) {
          const mIdx = dataMap['summary'].metrics.findIndex((m: any) =>
            labelKeywords.some(kw => String(m?.label || '').includes(kw))
          );
          if (mIdx >= 0) {
            dataMap['summary'].metrics[mIdx] = {
              ...dataMap['summary'].metrics[mIdx],
              value: cleanVal,
            };
          }
        }
        if (Array.isArray(dataMap['summary'].heroCard?.stats)) {
          const sIdx = dataMap['summary'].heroCard.stats.findIndex((s: any) =>
            labelKeywords.some(kw => String(s?.label || '').includes(kw))
          );
          if (sIdx >= 0) {
            dataMap['summary'].heroCard.stats[sIdx] = {
              ...dataMap['summary'].heroCard.stats[sIdx],
              value: cleanVal,
            };
          }
        }
      };

      updateSummaryMetric(['매매 희망가', '매매가', '희망가'], hlOv.askingPrice);
      updateSummaryMetric(['현재 수익률', '현행 수익률', 'As-Is', '현행 Cap'], hlOv.grossYield);
      updateSummaryMetric(['기대 수익률', '안정화 수익률', 'Stabilized', '안정화 Cap'], hlOv.stabilizedYield);
      updateSummaryMetric(['대지면적'], hlOv.landArea);
      updateSummaryMetric(['연면적'], hlOv.grossArea);
      updateSummaryMetric(['임대 현황', '공실', '임대율'], hlOv.vacancySignal);
    }

    // 03 Overview / Building
    const ovOv = slideOverrides['overview'] || slideOverrides['building'];
    if (ovOv && dataMap['building']) {
      if (!dataMap['building'].left) dataMap['building'].left = { sub: '건축물대장·토지이용계획확인서 기준', rows: [] };
      if (!Array.isArray(dataMap['building'].left.rows)) dataMap['building'].left.rows = [];
      const rows: [string, string][] = dataMap['building'].left.rows;

      const upsertRow = (label: string, val?: string) => {
        if (!val || !String(val).trim()) return;
        const normLabel = label.replace(/\s+/g, '');
        const isFloorLabel = normLabel === '규모' || normLabel === '층수' || normLabel === '건축규모';
        const idx = rows.findIndex(([k]) => {
          const nk = k.replace(/\s+/g, '');
          return isFloorLabel ? (nk === '규모' || nk === '층수' || nk === '건축규모') : nk === normLabel;
        });
        let cleanVal = sanitizeAreaStr(sanitizeStation(String(val).trim()));
        const existingVal = idx >= 0 ? String(rows[idx][1] || '').trim() : '';
        if (normLabel === '사용승인일' && /^\d{4}년?$/.test(cleanVal)) {
          const yr = cleanVal.slice(0, 4);
          cleanVal = existingVal.startsWith(yr) && existingVal.length > 5 ? existingVal : `${yr}년`;
        }
        if (normLabel === '소재지' && existingVal.includes('지번') && !cleanVal.includes('지번')) {
          cleanVal = existingVal;
        }
        if ((normLabel === '대지면적' || normLabel === '건축면적' || normLabel === '연면적') && existingVal.includes('㎡')) {
          const exSqm = parseFloat(existingVal.replace(/,/g, ''));
          const clSqm = parseFloat(cleanVal.replace(/,/g, ''));
          if (exSqm > 0 && clSqm > 0 && Math.abs(exSqm - clSqm) / exSqm < 0.02) cleanVal = existingVal;
        }
        if (normLabel === '건폐율/용적률') {
          cleanVal = cleanVal.replace(/건폐율\s*/g, '').replace(/용적률\s*/g, '');
          if (existingVal.includes('%')) {
            const exNums = [...existingVal.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]).toFixed(1));
            const clNums = [...cleanVal.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]).toFixed(1));
            if (exNums.length === 2 && clNums.length === 2 && exNums[0] === clNums[0] && exNums[1] === clNums[1]) {
              cleanVal = existingVal;
            }
          }
        }
        if (normLabel === '주차/승강기') {
          cleanVal = cleanVal.replace(/^주차\s*/, '').replace(/\/\s*승강기\s*/, '/ ');
          if (/^0대\b/.test(cleanVal) && /^[1-9]\d*대\b/.test(existingVal)) cleanVal = existingVal;
        }
        if ((normLabel === '주용도' || normLabel === '주구조') && existingVal && existingVal !== '-') {
          if (cleanVal === docBody.ssot_summary?.asset_type || cleanVal === '근린생활시설·업무시설' || (cleanVal === '철근콘크리트조' && existingVal === '철근콘크리트구조')) {
            cleanVal = existingVal;
          }
        }
        if (isFloorLabel && idx >= 0 && /^B\d+\/\d+F$/i.test(cleanVal) && /지하.*지상/.test(String(rows[idx][1] || ''))) {
          cleanVal = String(rows[idx][1]);
        }
        if (idx >= 0) rows[idx] = [isFloorLabel ? '층수' : rows[idx][0], cleanVal];
        else rows.push([isFloorLabel ? '층수' : label, cleanVal]);
      };

      if (ovOv.buildingName && String(ovOv.buildingName).trim()) {
        const bName = sanitizeStation(String(ovOv.buildingName).trim());
        (dataMap['building'] as any).buildingName = bName;
        const nameIdx = rows.findIndex(([k]) => {
          const nk = k.replace(/\s+/g, '');
          return nk === '건물명' || nk === '물건명' || nk === '명칭';
        });
        if (nameIdx >= 0) {
          rows[nameIdx] = [rows[nameIdx][0], bName];
        }
      }

      upsertRow('소재지', ovOv.address);
      upsertRow('대지면적', ovOv.landArea);
      upsertRow('건축면적', ovOv.archArea);
      upsertRow('연면적', ovOv.grossArea);
      upsertRow('규모', ovOv.floors);
      upsertRow('사용승인일', ovOv.completionYear);
      upsertRow('용도지역', ovOv.zoning);
      upsertRow('건폐율 / 용적률', ovOv.bcrFar);
      upsertRow('주차 / 승강기', ovOv.parkingElevator);
      upsertRow('주용도', ovOv.mainUse);
      upsertRow('주구조', ovOv.structureType);

      if (ovOv.askingPrice) {
        dataMap['building'].priceTable = {
          label: '매매 희망가',
          value: String(ovOv.askingPrice).includes('VAT') ? String(ovOv.askingPrice) : `${ovOv.askingPrice} (VAT 별도)`,
        };
      }
      if (ovOv.landUnitPrice) {
        dataMap['building'].priceTable2 = {
          label: '토지평당가',
          value: String(ovOv.landUnitPrice),
        };
      }
      if (ovOv.rightCallout || ovOv.buildingOverview) {
        const text = String(ovOv.rightCallout || ovOv.buildingOverview);
        const bullets = text
          .split('\n')
          .map(l => l.replace(/^[•·\-*]\s*/, '').trim())
          .filter(Boolean);
        if (bullets.length > 0) {
          const cleanBullets = bullets.map(sanitizeStation);
          const isDefaultOvCallout = cleanBullets.some(b => b.includes('건축물대장·토지이용계획확인서 공적장부 대조 완료')) || cleanBullets.every(b => uneditedSummaryPts.has(b));
          if (!isDefaultOvCallout || !Array.isArray(dataMap['building'].assetHighlights) || dataMap['building'].assetHighlights.length === 0) {
            dataMap['building'].assetHighlights = cleanBullets;
          }
        }
      }
    }

    // 04 Location
    const locOv = slideOverrides['location'];
    if (locOv && dataMap['location']) {
      if (!dataMap['location'].right) dataMap['location'].right = { sub: '광역 교통망 및 접근성', rows: [] };
      if (!Array.isArray(dataMap['location'].right.rows)) dataMap['location'].right.rows = [];
      const rows: [string, string][] = dataMap['location'].right.rows;

      const upsertLocRow = (label: string, val?: string) => {
        if (!val || !String(val).trim()) return;
        const idx = rows.findIndex(([k]) => k.includes(label));
        let cleanLoc = String(val).trim();
        const exLoc = idx >= 0 ? String(rows[idx][1] || '').trim() : '';
        if (label === '소재지' && exLoc.includes('지번') && !cleanLoc.includes('지번')) cleanLoc = exLoc;
        if (label === '대중교통' && exLoc.includes('·') && !cleanLoc.includes('·') && exLoc.startsWith(cleanLoc.split(' (')[0])) cleanLoc = exLoc;
        if (idx >= 0) rows[idx] = [rows[idx][0], cleanLoc];
        else rows.push([label, cleanLoc]);
      };

      upsertLocRow('소재지', locOv.address);
      upsertLocRow('대중교통', locOv.transitInfo ? sanitizeStation(String(locOv.transitInfo)) : undefined);
      if (locOv.roadInfo && locOv.roadInfo !== '차량 진·출입 및 보행 접근성 양호') upsertLocRow('도로', locOv.roadInfo);
      if (locOv.areaInfo && !String(locOv.areaInfo).endsWith('핵심 상업·업무 권역') && locOv.areaInfo !== '역세권 배후 상업·업무 밀집 권역') upsertLocRow('권역', locOv.areaInfo);

      if (locOv.locationCallout && !String(locOv.locationCallout).includes('중심의 유동인구 및 배후 오피스·주거 수요가 탄탄한 입지')) {
        dataMap['location'].right.callout = {
          kind: 'info',
          title: '입지 요약 및 상권 분석',
          body: sanitizeStation(String(locOv.locationCallout)),
        };
      }
      if (locOv.mapImageUrl) {
        dataMap['location'].mapImageUrl = String(locOv.mapImageUrl);
      }
    }

    // 05 Land
    const landOv = slideOverrides['land'];
    if (landOv && dataMap['land']) {
      if (Array.isArray(dataMap['land'].overviewRows)) {
        const ovRows: [string, string][] = dataMap['land'].overviewRows;
        const updateLandRow = (labelKeywords: string[], val?: string, fallbackLabel?: string) => {
          if (!val || !String(val).trim()) return;
          const idx = ovRows.findIndex(([k]) => labelKeywords.some(kw => k.includes(kw)));
          let cleanLand = sanitizeAreaStr(String(val).trim());
          if (idx >= 0) {
            const exLand = String(ovRows[idx][1] || '').trim();
            if (labelKeywords.includes('공시지가') && exLand.includes('원/㎡') && cleanLand.includes('만원/㎡')) cleanLand = exLand;
            if (labelKeywords.includes('용도지역') && exLand.includes('·') && !cleanLand.includes('·') && exLand.startsWith(cleanLand)) cleanLand = exLand;
            if (labelKeywords.includes('면적') && exLand.includes('㎡')) {
              const exSqm = parseFloat(exLand.replace(/,/g, ''));
              const clSqm = parseFloat(cleanLand.replace(/,/g, ''));
              if (exSqm > 0 && clSqm > 0 && Math.abs(exSqm - clSqm) / exSqm < 0.02) cleanLand = exLand;
            }
            ovRows[idx] = [ovRows[idx][0], cleanLand];
          } else if (fallbackLabel) {
            ovRows.push([fallbackLabel, cleanLand]);
          }
        };
        updateLandRow(['대지면적', '면적'], landOv.landArea, '면적');
        updateLandRow(['지목'], landOv.landCategory, '지목');
        updateLandRow(['용도지역', '지역지구'], landOv.zoningInfo, '지역지구');
        updateLandRow(['공시지가'], landOv.officialLandPrice, '공시지가');
        updateLandRow(['건폐율', '용적률'], landOv.bcrFar);
      }
      if (landOv.nationalLaw || landOv.otherLaws) {
        const existingConfirm = dataMap['land'].landUseConfirm || {
          nationalLaw: '',
          otherLaws: '',
          nationalItems: [],
          otherItems: [],
        };
        const splitLaws = (raw: unknown): string[] =>
          String(raw || '')
            .split(/[,·\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
        const natStr = String(landOv.nationalLaw || '').trim();
        const existingNatStr = String(
          Array.isArray(existingConfirm.nationalLaw)
            ? existingConfirm.nationalLaw.join(', ')
            : existingConfirm.nationalLaw || ''
        ).trim();
        const natList = natStr ? splitLaws(natStr) : [];
        const isDefaultNat =
          !natStr ||
          natStr === '국토의 계획 및 이용에 관한 법률 지역·지구' ||
          (natList.length === 1 && existingNatStr.length > natStr.length && existingNatStr.includes(natStr));

        const othStr = String(landOv.otherLaws || '').trim();
        const othList = othStr ? splitLaws(othStr) : [];
        const isDefaultOth =
          !othStr ||
          othStr === '건축법 · 주차장법 · 하수도법 등 관계 법령 적용';

        if (!isDefaultNat || !isDefaultOth) {
          dataMap['land'].landUseConfirm = {
            ...existingConfirm,
            ...(!isDefaultNat
              ? {
                  nationalLaw: natList.join(', '),
                  nationalItems: natList.map(name => ({
                    code: 'UQA',
                    name,
                    conflict: '포함' as const,
                    formatted: name,
                  })),
                }
              : {}),
            ...(!isDefaultOth
              ? {
                  otherLaws: othList.join(', '),
                  otherItems: othList.map(name => ({
                    code: 'ETC',
                    name,
                    conflict: '포함' as const,
                    formatted: name,
                  })),
                }
              : {}),
          };
        }
      }
      if (landOv.cadastralMapImage) {
        const cadImg = String(landOv.cadastralMapImage);
        dataMap['land'].cadastralMapImage = cadImg;
        dataMap['land'].cadastralImage = cadImg;
        dataMap['land'].mapImageUrl = cadImg;
        dataMap['land'].photoUrl = cadImg;
      }
      if (landOv.landCallout || landOv.landUsePlan) {
        const note = String(landOv.landCallout || landOv.landUsePlan).trim();
        if (note && note !== '토지이용계획확인원 및 건축물대장 기준 공법상 특이 제한사항 확인') {
          dataMap['land'].brokerConfirmNote = note;
          dataMap['land'].brokerRegulationText = note;
          if (dataMap['land'].right) {
            dataMap['land'].right.callout = {
              kind: 'info',
              title: '토지 규제 및 공법 검토',
              body: note,
            };
          }
        }
      }
    }

    // 06 Rent Roll (applies to primary rentRoll and any multi-slide rentRoll_1, rentRoll_2...)
    const rrOv = slideOverrides['rentroll'] || slideOverrides['rentRoll'];
    if (rrOv) {
      const rrTargets = Object.keys(dataMap)
        .filter(k => k === 'rentRoll' || k.startsWith('rentRoll_'))
        .map(k => dataMap[k])
        .filter(Boolean);

      const normalizedTenantRows =
        Array.isArray(rrOv.tenantData) && rrOv.tenantData.length > 0
          ? rrOv.tenantData.map((r: any) => {
              if (!r || typeof r !== 'object') return r;
              return {
                ...r,
                floor: r.floor ?? r.unit ?? '',
                tenant_name: r.tenant_name ?? r.tenant ?? '',
                tenant_type: r.tenant_type ?? r.use ?? r.business_type ?? '',
                area_sqm: r.area_sqm ?? r.area ?? undefined,
                deposit_manwon: r.deposit_manwon ?? r.deposit ?? undefined,
                rent_manwon: r.rent_manwon ?? r.monthlyRent ?? r.rent ?? undefined,
                mgmt_fee_manwon: r.mgmt_fee_manwon ?? r.managementFee ?? r.mgmt ?? undefined,
                lease_end: r.lease_end ?? r.contract_end ?? r.contractEnd ?? undefined,
                note: r.note ?? '',
              };
            })
          : null;

      if (
        normalizedTenantRows &&
        dataMap['rentRoll'] &&
        (Array.isArray(dataMap['rentRoll'].tableRows) || Array.isArray(dataMap['rentRoll'].rows)) &&
        JSON.stringify(rrOv.tenantData) !== JSON.stringify(docBody.floor_leases ?? docBody.rentRoll ?? docBody.ssot_summary?.floor_leases)
      ) {
        bindRentRollTable(
          { body: { ...docBody, preset: docBody.preset || 'credeal_basic', floor_leases: normalizedTenantRows } },
          '',
          dataMap
        );
      }

      const refreshedRrTargets = Object.keys(dataMap)
        .filter(k => k === 'rentRoll' || k.startsWith('rentRoll_'))
        .map(k => dataMap[k])
        .filter(Boolean);

      for (const rrTarget of refreshedRrTargets) {
        if (rrOv.depositTotal) (rrTarget as any).depositTotal = String(rrOv.depositTotal);
        if (rrOv.monthlyRentTotal) (rrTarget as any).monthlyRentTotal = String(rrOv.monthlyRentTotal);
        if (rrOv.occupancyRate) (rrTarget as any).occupancyRate = String(rrOv.occupancyRate);
        if (rrOv.vacancySignal) (rrTarget as any).vacancySignal = String(rrOv.vacancySignal);

        if (normalizedTenantRows) {
          (rrTarget as any).studioTenantData = rrOv.tenantData;
          (rrTarget as any).leases = normalizedTenantRows;
          (rrTarget as any).rows = normalizedTenantRows.map((r: any) => ({
            ...r,
            floor: r.floor,
            unit: r.unit_label || r.unit_number || r.unit || '',
            tenant: r.is_vacant ? '공실' : (r.tenant_name || r.tenant || ''),
          }));
        }

        if (rrOv.turnaroundStrategy) {
          const lines = String(rrOv.turnaroundStrategy)
            .split('\n')
            .map(l => l.replace(/^[•·\-*]\s*/, '').trim())
            .filter(Boolean);
          if (lines.length > 0) {
            (rrTarget as any).brokerPostAcquisitionPlan = lines;
          }
        }
        if (rrOv.stabilizedYieldTitle) {
          (rrTarget as any).brokerPostAcquisitionTitle = String(rrOv.stabilizedYieldTitle);
        }
        if (rrOv.rentrollNotes) {
          const rrNote = String(rrOv.rentrollNotes).trim();
          if (rrNote && rrNote !== '보증금·임대료는 현행 임대차계약 기준이며 관리비·부가세는 별도입니다.') {
            (rrTarget as any).rentrollFactsNote = rrNote;
          }
        }
      }
    }

    // 07 Yield
    const yieldOv = slideOverrides['yield'] || slideOverrides['yieldFormula'];
    if (yieldOv && dataMap['yieldFormula']) {
      const yf = dataMap['yieldFormula'];
      if (yieldOv.capRateBase) {
        const num = parseFloat(String(yieldOv.capRateBase).replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          yf.capRateAsIs = num;
          if (yf.yieldSet) {
            yf.yieldSet.grossYieldNetOfDeposit = num;
            if (yf.yieldSet.current) {
              yf.yieldSet.current = {
                ...yf.yieldSet.current,
                value: num,
                valuePct: num,
                formatted: `${num.toFixed(2)}%`,
              };
            }
          }
        }
      }
      if (yieldOv.capRateStabilized) {
        const num = parseFloat(String(yieldOv.capRateStabilized).replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          yf.capRateStabilized = num;
          if (yf.yieldSet) {
            const prevStab = yf.yieldSet.stabilized || {};
            const isReserveOnly = !prevStab.kind || prevStab.kind === 'reserve_excluded';
            yf.yieldSet.stabilized = {
              ...prevStab,
              value: num,
              valuePct: num,
              formatted: `${num.toFixed(2)}%`,
              kind: isReserveOnly ? 'target_rent' : prevStab.kind,
              label: isReserveOnly ? '안정화 기대수익률 (중개인 가정)' : (prevStab.label || '안정화 기대수익률'),
            };
          }
        }
      }
      const askKrw = parseKoreanCurrencyToKrw(yieldOv.askingPrice);
      if (askKrw != null && (!yf.askingPrice || Math.abs(askKrw - yf.askingPrice) / yf.askingPrice > 0.01)) {
        yf.askingPrice = askKrw;
        yf.askingPriceKrw = askKrw;
      }
      const depKrw = parseKoreanCurrencyToKrw(yieldOv.totalDeposit);
      if (depKrw != null && (!yf.totalDeposit || Math.abs(depKrw - yf.totalDeposit) / yf.totalDeposit > 0.01)) {
        yf.totalDeposit = depKrw;
        yf.depositTotalKrw = depKrw;
      }
      const annRentKrw = parseKoreanCurrencyToKrw(yieldOv.annualRent);
      if (annRentKrw != null && (!yf.annualRent || Math.abs(annRentKrw - yf.annualRent) / yf.annualRent > 0.01)) {
        yf.annualRent = annRentKrw;
        yf.annualRentKrw = annRentKrw;
        yf.monthlyRentTotalKrw = Math.round(annRentKrw / 12);
      }
      if (yieldOv.pricePerPyeong && Array.isArray(yf.unitPriceMetrics)) {
        const pyIdx = yf.unitPriceMetrics.findIndex((m: any) =>
          String(m?.label || '').includes('평당')
        );
        if (pyIdx >= 0) {
          yf.unitPriceMetrics[pyIdx] = {
            ...yf.unitPriceMetrics[pyIdx],
            value: String(yieldOv.pricePerPyeong).trim(),
          };
        }
      }
      const DEFAULT_STAB_NOTES = new Set([
        '공실 해소 및 주변 시세 수준 재계약 가정 시 기대 수익률',
      ]);
      const DEFAULT_YIELD_NOTES = new Set([
        '관리비 수입 및 공실 해소 시 추가 수익 상승 여력 보유',
        '실투자금 = 매매 희망가 − 총 보증금 기준 (취득세·중개보수 및 대출 레버리지 별도)',
      ]);
      const stabNote = yieldOv.stabilizedAssumption ? String(yieldOv.stabilizedAssumption).trim() : '';
      const extraYieldNote = yieldOv.yieldNotes ? String(yieldOv.yieldNotes).trim() : '';
      const combinedCaption = [
        stabNote && !DEFAULT_STAB_NOTES.has(stabNote) && stabNote !== yf.yieldSet?.stabilized?.caption ? stabNote : '',
        extraYieldNote && !DEFAULT_YIELD_NOTES.has(extraYieldNote) ? extraYieldNote : '',
      ].filter(Boolean).join(' · ');
      if (combinedCaption) {
        yf.stabilizedAssumption = combinedCaption;
        if (yf.yieldSet?.stabilized) {
          const prevStab = yf.yieldSet.stabilized;
          const isReserveOnly = !prevStab.kind || prevStab.kind === 'reserve_excluded';
          yf.yieldSet.stabilized = {
            ...prevStab,
            kind: isReserveOnly ? 'target_rent' : prevStab.kind,
            label: isReserveOnly ? '안정화 기대수익률 (중개인 가정)' : (prevStab.label || '안정화 기대수익률'),
            caption: combinedCaption,
          };
        }
      }
    }

    // 08 Market Comparables (brokerComps / marketComps)
    const compsOv = slideOverrides['comps'] || slideOverrides['brokerComps'] || slideOverrides['marketComps'];
    if (compsOv) {
      const rawCompsList = Array.isArray(compsOv.comparables)
        ? compsOv.comparables
        : Array.isArray(compsOv.compsRows)
        ? compsOv.compsRows
        : [];
      if (rawCompsList.length > 0) {
        const normalizedComps = rawCompsList
          .map((c: any) => {
            if (!c || typeof c !== 'object') return null;
            const location = String(c.location || c.name || c.address || '').trim();
            if (!location) return null;
            const as_of = String(c.as_of || c.trade_date || c.date || '').trim();
            const parseNum = (v: unknown): number => {
              if (typeof v === 'number' && Number.isFinite(v)) return v;
              const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
              return Number.isFinite(n) ? n : 0;
            };
            const price_eok = parseNum(c.price_eok ?? c.price);
            const land_area_pyeong = parseNum(c.land_area_pyeong ?? c.land_pyeong);
            const gfa_pyeong = parseNum(c.gfa_pyeong ?? c.gross_area_pyeong ?? c.gross_pyeong);
            const land_price_per_pyeong_manwon =
              parseNum(c.land_price_per_pyeong_manwon ?? c.land_unit_manwon) ||
              (price_eok > 0 && land_area_pyeong > 0 ? Math.round((price_eok * 10000) / land_area_pyeong) : 0);
            if (price_eok <= 0 && land_price_per_pyeong_manwon <= 0) return null;
            return {
              kind: (c.kind === 'listing' ? 'listing' : 'transaction') as 'listing' | 'transaction',
              location,
              ...(as_of && as_of !== '-' ? { as_of } : {}),
              ...(price_eok > 0 ? { price_eok } : {}),
              ...(land_area_pyeong > 0 ? { land_area_pyeong } : {}),
              ...(gfa_pyeong > 0 ? { gfa_pyeong } : {}),
              ...(land_price_per_pyeong_manwon > 0 ? { land_price_per_pyeong_manwon } : {}),
              ...(c.note ? { note: String(c.note) } : {}),
            };
          })
          .filter(Boolean) as any[];

        if (normalizedComps.length > 0) {
          const builtComps = buildBrokerCompsData(
            { market_comps: normalizedComps },
            { ssot: docBody.ssot_summary ?? null, body: docBody }
          );
          if (builtComps) {
            dataMap['brokerComps'] = builtComps as any;
            if (!sequence.some(s => s.dataKey === 'brokerComps')) {
              const afterIdx = sequence.findIndex(s => s.dataKey === 'yieldFormula');
              const landIdx = sequence.findIndex(s => s.dataKey === 'land');
              const insertAt = afterIdx >= 0 ? afterIdx + 1 : landIdx >= 0 ? landIdx + 1 : Math.max(0, sequence.length - 1);
              sequence.splice(insertAt, 0, {
                archetype: 'A26',
                kicker: 'Market Comps',
                title: '인근 시세 비교',
                dataKey: 'brokerComps',
              });
            }
          }
          if (dataMap['marketComps']) {
            dataMap['marketComps'].comparables = normalizedComps;
          }
        }
      }
      if (compsOv.compsNotes) {
        const cNote = String(compsOv.compsNotes).trim();
        if (cNote && cNote !== '국토교통부 실거래가 공개시스템 및 인근 중개 탐문 기준 유사 거래사례입니다.') {
          if (dataMap['brokerComps']) {
            const prevFn = Array.isArray((dataMap['brokerComps'] as any).footnotes)
              ? (dataMap['brokerComps'] as any).footnotes
              : [];
            (dataMap['brokerComps'] as any).footnotes = [...prevFn, `※ ${cNote}`];
          }
          if (dataMap['marketComps']) {
            dataMap['marketComps'].compsSummaryNote = cNote;
          }
        }
      }
    }

    // 09 Gallery
    const galOv = slideOverrides['gallery'];
    if (galOv && dataMap['gallery']) {
      if (galOv.galleryTitle && String(galOv.galleryTitle).trim()) {
        const gTitle = String(galOv.galleryTitle).trim();
        dataMap['gallery'].title = gTitle;
        if (dataMap['gallery_0']) {
          dataMap['gallery_0'].title = dataMap['gallery_1'] ? `${gTitle} (1/2)` : gTitle;
        }
        if (dataMap['gallery_1']) {
          dataMap['gallery_1'].title = `${gTitle} (2/2)`;
        }
      }
      const layoutMap: Record<string, string> = {
        grid_4: 'GRID_2X2',
        hero_3: 'ONE_LARGE_TWO_SMALL_H',
        split_2: 'DUAL_LANDSCAPE',
        GRID_2X3: 'GRID_2X3',
        GRID_2X2: 'GRID_2X2',
        ONE_LARGE_TWO_SMALL_H: 'ONE_LARGE_TWO_SMALL_H',
        DUAL_LANDSCAPE: 'DUAL_LANDSCAPE',
        FULL_WIDE: 'FULL_WIDE',
      };
      const isHero3LayoutType = slideTitles?.gallery?.layoutType === 'A14_HERO_3';
      const mappedLayout =
        isHero3LayoutType && (!galOv.galleryLayout || galOv.galleryLayout === 'grid_4')
          ? 'ONE_LARGE_TWO_SMALL_H'
          : galOv.galleryLayout
          ? layoutMap[String(galOv.galleryLayout)]
          : undefined;

      if (Array.isArray(galOv.photos) && galOv.photos.length > 0) {
        const includedPhotos = galOv.photos.filter((p: any) => p && p.included !== false && p.excluded !== true && p.url);
        if (includedPhotos.length > 0) {
          const sortedPhotos = [...includedPhotos].sort((a: any, b: any) => {
            const rank = (p: any) => (p.isHero || p.role === 'cover') ? 0 : p.role === 'exterior' ? 1 : 2;
            return rank(a) - rank(b);
          }).slice(0, 12);
          if (dataMap['building'] && sortedPhotos[0]?.url) {
            dataMap['building'].photoUrl = sortedPhotos[0].url;
          }
          dataMap['gallery'].photos = sortedPhotos;
          dataMap['gallery'].photoUrls = sortedPhotos.map((p: any) => p.url);
          if (mappedLayout) dataMap['gallery'].layout = mappedLayout;

          const pickLayout = (batch: any[]) =>
            mappedLayout ||
            (batch.length >= 5
              ? 'GRID_2X3'
              : batch.length === 4
              ? 'GRID_2X2'
              : batch.length === 3
              ? 'ONE_LARGE_TWO_SMALL_H'
              : batch.length === 2
              ? 'DUAL_LANDSCAPE'
              : 'FULL_WIDE');

          const baseTitle = (galOv.galleryTitle && String(galOv.galleryTitle).trim()) || '현장 사진';
          if (sortedPhotos.length <= 6) {
            if (dataMap['gallery_0']) {
              dataMap['gallery_0'].photos = sortedPhotos;
              dataMap['gallery_0'].photoUrls = sortedPhotos.map((p: any) => p.url);
              dataMap['gallery_0'].layout = pickLayout(sortedPhotos);
              dataMap['gallery_0'].title = baseTitle;
            }
            if (dataMap['gallery_1']) {
              delete dataMap['gallery_1'];
              const g1Idx = sequence.findIndex(s => s.dataKey === 'gallery_1');
              if (g1Idx >= 0) sequence.splice(g1Idx, 1);
            }
          } else {
            const firstCount = Math.ceil(sortedPhotos.length / 2);
            const p1 = sortedPhotos.slice(0, firstCount);
            const p2 = sortedPhotos.slice(firstCount);
            dataMap['gallery_0'] = {
              ...(dataMap['gallery_0'] || dataMap['gallery']),
              kicker: 'Gallery',
              title: `${baseTitle} (1/2)`,
              photos: p1,
              photoUrls: p1.map((p: any) => p.url),
              layout: pickLayout(p1),
            };
            dataMap['gallery_1'] = {
              ...(dataMap['gallery_1'] || dataMap['gallery']),
              kicker: 'Gallery',
              title: `${baseTitle} (2/2)`,
              photos: p2,
              photoUrls: p2.map((p: any) => p.url),
              layout: pickLayout(p2),
            };
            if (!sequence.some(s => s.dataKey === 'gallery_1')) {
              const g0Idx = sequence.findIndex(s => s.dataKey === 'gallery_0' || s.dataKey === 'gallery');
              if (g0Idx >= 0) {
                sequence[g0Idx] = { ...sequence[g0Idx], title: `${baseTitle} (1/2)`, dataKey: 'gallery_0' };
                sequence.splice(g0Idx + 1, 0, {
                  archetype: 'A14',
                  kicker: 'Gallery',
                  title: `${baseTitle} (2/2)`,
                  dataKey: 'gallery_1',
                });
              }
            }
          }
        }
      } else if (mappedLayout) {
        dataMap['gallery'].layout = mappedLayout;
        if (dataMap['gallery_0']) dataMap['gallery_0'].layout = mappedLayout;
        if (dataMap['gallery_1']) dataMap['gallery_1'].layout = mappedLayout;
      }
    }

    // 10 Closing
    const clOv = slideOverrides['closing'];
    if (clOv && dataMap['closing']) {
      if (clOv.closingLine || clOv.closingSummary) {
        (dataMap['closing'] as any).closingLine = String(clOv.closingLine || clOv.closingSummary);
      }
      if (clOv.disclaimer && String(clOv.disclaimer).trim() !== '본 자료는 매수인의 투자 판단을 돕기 위한 참고자료로서 법적 효력이 없으며, 최종 계약 전 공적장부 및 현장 실사를 통해 제반 사항을 직접 확인하시기 바랍니다.') {
        dataMap['closing'].disclaimer = String(clOv.disclaimer);
      }
      if (!dataMap['closing'].brokerContact) dataMap['closing'].brokerContact = {};
      if (clOv.brokerName) dataMap['closing'].brokerContact.name = String(clOv.brokerName);
      if (clOv.brokerPhone) dataMap['closing'].brokerContact.phone = String(clOv.brokerPhone);
      if (clOv.brokerEmail) dataMap['closing'].brokerContact.email = String(clOv.brokerEmail);
      if (clOv.brokerCompany) dataMap['closing'].brokerContact.company = String(clOv.brokerCompany);
      if (clOv.brokerRegNo) dataMap['closing'].brokerContact.registrationNo = String(clOv.brokerRegNo);
    }
  }

  // Header/Footer disclaimer override on closing slide
  if (hf?.footerDisclaimer && dataMap['closing'] && !slideOverrides?.['closing']?.disclaimer) {
    dataMap['closing'].disclaimer = String(hf.footerDisclaimer);
  }

  // Slide layoutType variant mapping from _studioSlideTitles
  if (slideTitles) {
    const coverLt = slideTitles.cover?.layoutType;
    if (dataMap['cover']) {
      if (coverLt === 'A01_SPLIT') (dataMap['cover'] as any).coverStyle = 'split';
      else if (coverLt === 'A01_HERO') (dataMap['cover'] as any).coverStyle = 'hero_dark';
    }
    const hlLt = slideTitles.highlights?.layoutType || slideTitles.summary?.layoutType;
    if (hlLt === 'A02_EXECUTIVE' && dataMap['summary']) {
      (dataMap['summary'] as any).layoutVariant = 'executive';
    }
    const ovLt = slideTitles.overview?.layoutType || slideTitles.building?.layoutType;
    if (ovLt === 'A04_WIDE_SPEC' && dataMap['building']) {
      (dataMap['building'] as any).layoutVariant = 'wide_spec';
    }
    const locLt = slideTitles.location?.layoutType;
    if (locLt === 'A06_TRANSIT_FOCUS' && dataMap['location']) {
      (dataMap['location'] as any).layoutVariant = 'transit_focus';
    }
    const landLt = slideTitles.land?.layoutType;
    if (landLt === 'A06_LAND_CADASTRAL' && dataMap['land']) {
      (dataMap['land'] as any).layoutVariant = 'cadastral_focus';
    }
    const rrLt = slideTitles.rentroll?.layoutType || slideTitles.rentRoll?.layoutType;
    if (rrLt === 'A24_TABLE_FOCUS') {
      const rrTargets = Object.keys(dataMap)
        .filter(k => k === 'rentRoll' || k.startsWith('rentRoll_'))
        .map(k => dataMap[k])
        .filter(Boolean);
      for (const rrTarget of rrTargets) {
        (rrTarget as any).layoutVariant = 'table_focus';
      }
    }
    const yieldLt = slideTitles.yield?.layoutType || slideTitles.yieldFormula?.layoutType;
    if (yieldLt === 'A23_DUAL_YIELD' && dataMap['yieldFormula']) {
      (dataMap['yieldFormula'] as any).layoutVariant = 'dual_yield';
    }
    const galLt = slideTitles.gallery?.layoutType;
    const galOv = slideOverrides?.['gallery'];
    if (galLt === 'A14_HERO_3' && (!galOv?.galleryLayout || galOv.galleryLayout === 'grid_4')) {
      if (dataMap['gallery']) dataMap['gallery'].layout = 'ONE_LARGE_TWO_SMALL_H';
      if (dataMap['gallery_0']) dataMap['gallery_0'].layout = 'ONE_LARGE_TWO_SMALL_H';
      if (dataMap['gallery_1']) dataMap['gallery_1'].layout = 'ONE_LARGE_TWO_SMALL_H';
    }
  }

  const normalizeDeckGroupKey = (dataKey: string): string => {
    if (dataKey.startsWith('gallery_')) return 'gallery';
    if (dataKey.startsWith('rentRoll_')) return 'rentRoll';
    return dataKey;
  };

  // 2. Apply slide title & kicker overrides onto sequence
  let nextSeq = sequence.map(spec => {
    const groupKey = normalizeDeckGroupKey(spec.dataKey);
    const matchingStudioKey = Object.keys(STUDIO_KEY_TO_DECK_KEY).find(
      sk => STUDIO_KEY_TO_DECK_KEY[sk] === groupKey
    ) || groupKey;
    const titleMeta = slideTitles?.[matchingStudioKey] || slideTitles?.[spec.dataKey] || slideTitles?.[groupKey];
    if (!titleMeta) return spec;
    const suffixMatch = spec.title.match(/\(\d+\/\d+\)$/);
    const nextTitle = titleMeta.title
      ? suffixMatch && !titleMeta.title.includes(suffixMatch[0])
        ? `${titleMeta.title} ${suffixMatch[0]}`
        : titleMeta.title
      : spec.title;
    return {
      ...spec,
      title: nextTitle,
      kicker: titleMeta.kicker || spec.kicker,
    };
  });

  // 3. Filter out slides hidden in Studio (protecting cover & closing)
  if (Array.isArray(hiddenKeys) && hiddenKeys.length > 0) {
    const hiddenDeckKeys = new Set(
      hiddenKeys.map(k => STUDIO_KEY_TO_DECK_KEY[k] || k)
    );
    hiddenDeckKeys.delete('cover');
    hiddenDeckKeys.delete('closing');

    nextSeq = nextSeq.filter(spec => {
      const groupKey = normalizeDeckGroupKey(spec.dataKey);
      return !hiddenDeckKeys.has(groupKey) && !hiddenDeckKeys.has(spec.dataKey);
    });
  }

  // 4. Reorder slides according to Studio order if specified
  if (Array.isArray(slideOrder) && slideOrder.length > 0) {
    const orderRank = new Map<string, number>();
    slideOrder.forEach((sk, idx) => {
      const deckKey = STUDIO_KEY_TO_DECK_KEY[sk] || sk;
      if (!orderRank.has(deckKey)) {
        orderRank.set(deckKey, idx);
      }
    });

    nextSeq = [...nextSeq].sort((a, b) => {
      const keyA = normalizeDeckGroupKey(a.dataKey);
      const keyB = normalizeDeckGroupKey(b.dataKey);
      const rankA = orderRank.get(keyA) ?? 999;
      const rankB = orderRank.get(keyB) ?? 999;
      return rankA - rankB;
    });
  }

  return nextSeq;
}
