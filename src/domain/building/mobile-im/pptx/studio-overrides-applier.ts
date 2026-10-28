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
  if (!themeOv && !hf) return baseTheme;

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
  if (themeOv?.layoutStyle) {
    out.layoutStyle = themeOv.layoutStyle;
  }

  // 4. Header & Footer branding overrides
  if (hf) {
    if (hf.companyName) out.companyName = hf.companyName;
    if (hf.companyTagline) out.companyTagline = hf.companyTagline;
    if (hf.logoUrl) out.logoUrl = hf.logoUrl;
  }

  return out;
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

  if (!slideOverrides && !hiddenKeys && !slideOrder && !hf) {
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
        return;
        if (idx >= 0) rows[idx] = [rows[idx][0], String(val).trim()];
        else rows.push([label, String(val).trim()]);
      };

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
        const updateLandRow = (label: string, val?: string) => {
          if (!val || !String(val).trim()) return;
          const idx = ovRows.findIndex(([k]) => k.includes(label));
          if (idx >= 0) {
            let cleanLand = sanitizeAreaStr(String(val).trim());
            const exLand = String(ovRows[idx][1] || '').trim();
            if (label === '공시지가' && exLand.includes('원/㎡') && cleanLand.includes('만원/㎡')) cleanLand = exLand;
            if (label === '대지면적' && exLand.includes('㎡')) {
              const exSqm = parseFloat(exLand.replace(/,/g, ''));
              const clSqm = parseFloat(cleanLand.replace(/,/g, ''));
              if (exSqm > 0 && clSqm > 0 && Math.abs(exSqm - clSqm) / exSqm < 0.02) cleanLand = exLand;
            }
            ovRows[idx] = [ovRows[idx][0], cleanLand];
          }
        };
        updateLandRow('대지면적', landOv.landArea);
        updateLandRow('지목', landOv.landCategory);
        updateLandRow('용도지역', landOv.zoningInfo);
        updateLandRow('공시지가', landOv.officialLandPrice);
      }
      if (landOv.landCallout || landOv.landUsePlan) {
        const note = String(landOv.landCallout || landOv.landUsePlan).trim();
        if (note && note !== '토지이용계획확인원 및 건축물대장 기준 공법상 특이 제한사항 확인') {
          dataMap['land'].brokerConfirmNote = note;
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

    // 06 Rent Roll
    const rrOv = slideOverrides['rentroll'] || slideOverrides['rentRoll'];
    if (rrOv && dataMap['rentRoll']) {
      if (rrOv.turnaroundStrategy) {
        const lines = String(rrOv.turnaroundStrategy)
          .split('\n')
          .map(l => l.replace(/^[•·\-*]\s*/, '').trim())
          .filter(Boolean);
        if (lines.length > 0) {
          (dataMap['rentRoll'] as any).brokerPostAcquisitionPlan = lines;
        }
      }
      if (rrOv.stabilizedYieldTitle) {
        (dataMap['rentRoll'] as any).brokerPostAcquisitionTitle = String(rrOv.stabilizedYieldTitle);
      }
      if (rrOv.rentrollNotes) {
        const rrNote = String(rrOv.rentrollNotes).trim();
        if (rrNote && rrNote !== '보증금·임대료는 현행 임대차계약 기준이며 관리비·부가세는 별도입니다.') {
          (dataMap['rentRoll'] as any).rentrollFactsNote = rrNote;
        }
      }
    }

    // 07 Yield
    const yieldOv = slideOverrides['yield'] || slideOverrides['yieldFormula'];
    if (yieldOv && dataMap['yieldFormula']) {
      if (yieldOv.capRateBase) {
        const num = parseFloat(String(yieldOv.capRateBase).replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          dataMap['yieldFormula'].capRateAsIs = num;
        }
      }
      if (yieldOv.capRateStabilized) {
        const num = parseFloat(String(yieldOv.capRateStabilized).replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          dataMap['yieldFormula'].capRateStabilized = num;
        }
      }
      if (yieldOv.stabilizedAssumption && String(yieldOv.stabilizedAssumption).trim() !== '공실 해소 및 주변 시세 수준 재계약 가정 시 기대 수익률') {
        dataMap['yieldFormula'].stabilizedAssumption = String(yieldOv.stabilizedAssumption);
      }
    }

    // 09 Gallery
    const galOv = slideOverrides['gallery'];
    if (galOv && Array.isArray(galOv.photos) && galOv.photos.length > 0) {
      const includedPhotos = galOv.photos.filter((p: any) => p && p.included !== false && p.excluded !== true && p.url);
      const hasGalleryExclusions = galOv.photos.some((p: any) => p && (p.included === false || p.excluded === true));
      const alreadyPlannedCount = (dataMap['gallery_0']?.photos?.length ?? 0) + (dataMap['gallery_1']?.photos?.length ?? 0);
      if (includedPhotos.length > 0 && dataMap['gallery'] && (hasGalleryExclusions || alreadyPlannedCount < Math.min(11, includedPhotos.length - 1))) {
        const sortedPhotos = [...includedPhotos].sort((a: any, b: any) => {
          const rank = (p: any) => (p.isHero || p.role === 'cover') ? 0 : p.role === 'exterior' ? 1 : 2;
          return rank(a) - rank(b);
        }).slice(0, 12);
        dataMap['gallery'].photos = sortedPhotos;
        dataMap['gallery'].photoUrls = sortedPhotos.map((p: any) => p.url);
        if (sortedPhotos.length <= 6) {
          if (dataMap['gallery_0']) {
            dataMap['gallery_0'].photos = sortedPhotos;
            dataMap['gallery_0'].photoUrls = sortedPhotos.map((p: any) => p.url);
          }
        } else {
          const firstCount = Math.ceil(sortedPhotos.length / 2);
          const p1 = sortedPhotos.slice(0, firstCount);
          const p2 = sortedPhotos.slice(firstCount);
          const pickLayout = (batch: any[]) => batch.length >= 5 ? 'GRID_2X3' : batch.length === 4 ? 'GRID_2X2' : batch.length === 3 ? 'ONE_LARGE_TWO_SMALL_H' : batch.length === 2 ? 'DUAL_LANDSCAPE' : 'FULL_WIDE';
          dataMap['gallery_0'] = { ...(dataMap['gallery_0'] || dataMap['gallery']), kicker: 'Gallery', title: '현장 사진 (1/2)', photos: p1, photoUrls: p1.map((p: any) => p.url), layout: pickLayout(p1) };
          dataMap['gallery_1'] = { ...(dataMap['gallery_1'] || dataMap['gallery']), kicker: 'Gallery', title: '현장 사진 (2/2)', photos: p2, photoUrls: p2.map((p: any) => p.url), layout: pickLayout(p2) };
          if (!sequence.some(s => s.dataKey === 'gallery_1')) {
            const g0Idx = sequence.findIndex(s => s.dataKey === 'gallery_0' || s.dataKey === 'gallery');
            if (g0Idx >= 0) {
              sequence[g0Idx] = { ...sequence[g0Idx], title: '현장 사진 (1/2)', dataKey: 'gallery_0' };
              sequence.splice(g0Idx + 1, 0, { archetype: 'A14', kicker: 'Gallery', title: '현장 사진 (2/2)', dataKey: 'gallery_1' });
            }
          }
        }
        if (false) dataMap['gallery'].photos = includedPhotos;
        dataMap['gallery'].photoUrls = includedPhotos.map((p: any) => p.url);
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

  // 2. Apply slide title & kicker overrides onto sequence
  let nextSeq = sequence.map(spec => {
    const matchingStudioKey = Object.keys(STUDIO_KEY_TO_DECK_KEY).find(
      sk => STUDIO_KEY_TO_DECK_KEY[sk] === spec.dataKey
    ) || spec.dataKey;
    const titleMeta = slideTitles?.[matchingStudioKey] || slideTitles?.[spec.dataKey];
    if (!titleMeta) return spec;
    return {
      ...spec,
      title: titleMeta.title || spec.title,
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
      if (spec.dataKey.startsWith('gallery_') && hiddenDeckKeys.has('gallery')) {
        return false;
      }
      return !hiddenDeckKeys.has(spec.dataKey);
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
      const keyA = a.dataKey.startsWith('gallery_') ? 'gallery' : a.dataKey;
      const keyB = b.dataKey.startsWith('gallery_') ? 'gallery' : b.dataKey;
      const rankA = orderRank.get(keyA) ?? 999;
      const rankB = orderRank.get(keyB) ?? 999;
      return rankA - rankB;
    });
  }

  return nextSeq;
}
