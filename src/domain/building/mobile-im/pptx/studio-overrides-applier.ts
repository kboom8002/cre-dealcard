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
  const slideOverrides = docBody._studioSlideOverrides as Record<string, Record<string, any>> | undefined;
  const slideTitles = docBody._studioSlideTitles as Record<string, { title?: string; kicker?: string; layoutType?: string }> | undefined;
  const hiddenKeys = docBody._studioHiddenDataKeys as string[] | undefined;
  const slideOrder = docBody._studioSlideOrder as string[] | undefined;
  const hf = docBody._studioHeaderFooter as Record<string, any> | undefined;

  if (!slideOverrides && !hiddenKeys && !slideOrder && !hf) {
    return sequence;
  }

  // 1. Apply data overrides into dataMap
  if (slideOverrides) {
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
        dataMap['summary'].leadSentence = String(hlOv.leadSentence || hlOv.keyInvestmentPoint);
      }
      const pts = [
        hlOv.keyInvestmentPoint,
        hlOv.investmentPoint2,
        hlOv.investmentPoint3,
      ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (pts.length > 0) {
        dataMap['summary'].keyPoints = pts;
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
        const idx = rows.findIndex(([k]) => k.replace(/\s+/g, '') === label.replace(/\s+/g, ''));
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
          dataMap['building'].assetHighlights = bullets;
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
        if (idx >= 0) rows[idx] = [rows[idx][0], String(val).trim()];
        else rows.push([label, String(val).trim()]);
      };

      upsertLocRow('소재지', locOv.address);
      upsertLocRow('대중교통', locOv.transitInfo);
      upsertLocRow('도로', locOv.roadInfo);
      upsertLocRow('권역', locOv.areaInfo);

      if (locOv.locationCallout) {
        dataMap['location'].right.callout = {
          kind: 'info',
          title: '입지 요약 및 상권 분석',
          body: String(locOv.locationCallout),
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
          if (idx >= 0) ovRows[idx] = [ovRows[idx][0], String(val).trim()];
        };
        updateLandRow('대지면적', landOv.landArea);
        updateLandRow('지목', landOv.landCategory);
        updateLandRow('용도지역', landOv.zoningInfo);
        updateLandRow('공시지가', landOv.officialLandPrice);
      }
      if (landOv.landCallout || landOv.landUsePlan) {
        const note = String(landOv.landCallout || landOv.landUsePlan);
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
        (dataMap['rentRoll'] as any).rentrollFactsNote = String(rrOv.rentrollNotes);
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
      if (yieldOv.stabilizedAssumption) {
        dataMap['yieldFormula'].stabilizedAssumption = String(yieldOv.stabilizedAssumption);
      }
    }

    // 09 Gallery
    const galOv = slideOverrides['gallery'];
    if (galOv && Array.isArray(galOv.photos) && galOv.photos.length > 0) {
      const includedPhotos = galOv.photos.filter((p: any) => p && p.included !== false && p.excluded !== true && p.url);
      if (includedPhotos.length > 0 && dataMap['gallery']) {
        dataMap['gallery'].photos = includedPhotos;
        dataMap['gallery'].photoUrls = includedPhotos.map((p: any) => p.url);
      }
    }

    // 10 Closing
    const clOv = slideOverrides['closing'];
    if (clOv && dataMap['closing']) {
      if (clOv.closingLine || clOv.closingSummary) {
        (dataMap['closing'] as any).closingLine = String(clOv.closingLine || clOv.closingSummary);
      }
      if (clOv.disclaimer) {
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
