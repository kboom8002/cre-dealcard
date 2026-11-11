/**
 * @file src/app/api/broker/basic-im-studio/[id]/ai-text/route.ts
 * @description 10슬라이드 Basic IM 스튜디오 [AI 문구 다듬기] SOTA Hybrid LLM + SSOT Anchor API
 *
 * - 중개인이 입력한 초안(`currentText`)의 고유 현장 팩트(임차 특성, 계약 기간, 리모델링 이력 등)를 보존하면서
 *   프로젝트 공적장부·재무 SSOT(`overrides` + `buildingContext`) 및 3대 톤(`conservative`/`balanced`/`aggressive`)에 맞춰
 *   기관투자가 수준 CRE 문체로 정제한다.
 * - 동적 Golden Set Few-Shot + pgvector Hybrid RAG 문체 참조 + 2-Attempt 미근거 수치·날조 브랜드 자가 교정
 * - DB 기반 CRE 용어사전(`normalizeTerminologyAsync`) 정규화 + 무중단 결정론적 SSOT 폴백 보장
 */
import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { isDeterministicLLMMode } from '@/ai/llm-determinism';
import { getModel } from '@/ai/model-selector';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { findNumbersNotInContext } from '@/lib/magazine/ai-comment-schema';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import type { MobileIMSectionType } from '@/domain/building/mobile-im/types';
import {
  askingPriceManwonToGoldenBand,
  buildImRepairFeedback,
  fetchDynamicImReferenceBlock,
  inferAssetTypeCode,
  mapWorkspacePostureToCanonical,
  polishImCopyWithLexicon,
  polishImCopyWithLexiconSync,
  validateImGeneratedCopy,
} from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('basic-im-studio-ai-text');

type ToneOption = 'conservative' | 'balanced' | 'aggressive';

function sanitizeRefinedText(raw: string): string {
  return raw
    .replace(/\b(undefined|null|NaN|Infinity)\b/g, '')
    .replace(/추후\s*제공|별도\s*문의\s*요망|미확인\s*항목/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function mapStudioDataKeyToSectionType(dataKey: string, fieldKey: string): MobileIMSectionType {
  if (dataKey === 'highlights' || fieldKey.startsWith('investmentPoint') || fieldKey === 'leadSentence') {
    return 'investment_thesis';
  }
  if (dataKey === 'location' || fieldKey === 'locationCallout') {
    return 'location_access';
  }
  if (dataKey === 'land' || fieldKey === 'landCallout') {
    return 'land_detail';
  }
  if (dataKey === 'overview' || fieldKey === 'rightCallout') {
    return 'property_overview';
  }
  if (dataKey === 'rentroll' || fieldKey === 'turnaroundStrategy' || fieldKey === 'rentrollNotes') {
    return 'lease_status';
  }
  if (dataKey === 'yield' || fieldKey === 'stabilizedAssumption' || fieldKey === 'yieldNotes') {
    return 'income_analysis';
  }
  if (dataKey === 'comps' || fieldKey === 'compsNotes') {
    return 'comparables';
  }
  if (dataKey === 'closing' || fieldKey === 'closingLine') {
    return 'closing';
  }
  return 'investment_thesis';
}

const TONE_GUIDELINES: Record<ToneOption, string> = {
  conservative:
    '보수적·공부기반(기관 투자심사 톤): 공적장부(건축물대장·토지이용계획확인원)와 현행 임대차 계약 팩트만 건조하고 명확하게 서술하고, 전망·기대 표현을 최소화하며 현장 실사 확인 권고를 병기하세요.',
  balanced:
    '균형·표준 브리핑(자문사 IM 표준 톤): 객관적 건물 제원 및 현행 임대 현금흐름 안정성과 중장기 입지·자산가치를 균형 있게 서술하세요.',
  aggressive:
    '적극·가치개선 강조(Value-add 제안 톤): 입지 희소성, 임대차 재구조화(Re-tenanting), 리모델링·용도 고도화 업사이드를 설득력 있게 부각하되, 수익 보장·원금 보장 같은 단정적 금칙어는 절대 쓰지 마세요.',
};

function pickStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function buildDeterministicRefinement(
  dataKey: string,
  fieldKey: string,
  currentText: string,
  tone: ToneOption,
  overrides: Record<string, unknown>,
  buildingName: string,
  tenantPoolSource: ReadonlyArray<unknown>,
): string {
  const addr = pickStr(overrides.address, buildingName);
  const ask = pickStr(overrides.askingPrice);
  const yieldBase = pickStr(overrides.grossYield) || pickStr(overrides.capRateBase);
  const yieldStab = pickStr(overrides.stabilizedYield) || pickStr(overrides.capRateStabilized);
  const transit = pickStr(overrides.transitInfo, '역세권 주요 교통망 인접');
  const zoning = pickStr(overrides.zoning) || pickStr(overrides.zoningInfo, '상업·업무 용도지역');
  const landArea = pickStr(overrides.landArea);
  const grossArea = pickStr(overrides.grossArea);

  const finalize = (draft: string) =>
    sanitizeRefinedText(
      polishImCopyWithLexiconSync(draft, {
        tenantPoolSource,
        preserveLinesAndMarkdown: true,
      }),
    );

  if (fieldKey === 'investmentPoint2') {
    const floors = pickStr(overrides.floors);
    const bcrFar = pickStr(overrides.bcrFar);
    if (tone === 'conservative') {
      return finalize(
        `${zoning} 내 ${landArea ? `대지면적 ${landArea}` : '대지'}${grossArea ? `, 연면적 ${grossArea}` : ''}${floors ? ` (${floors})` : ''} 규모의 자산으로, 건축물대장 기준 ${bcrFar ? `건폐율·용적률(${bcrFar}) 등 ` : ''}공적 제원이 명확히 확보되어 있습니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${zoning} 핵심 필지(${landArea || '우량 대지'}${grossArea ? ` / 연면적 ${grossArea}` : ''}${floors ? ` · ${floors}` : ''})로 ${bcrFar ? `건폐율·용적률(${bcrFar}) 활용도가 우수하며, ` : ''}향후 리모델링·증축 또는 용도 고도화를 통한 물리적 자산가치 제고가 가능합니다.`,
      );
    }
    return finalize(
      `${zoning} 입지의 ${landArea ? `대지 ${landArea}` : '정형 필지'}${grossArea ? ` · 연면적 ${grossArea}` : ''}${floors ? ` (${floors})` : ''} 규모 빌딩으로, ${bcrFar ? `건폐율·용적률(${bcrFar}) 및 ` : ''}기준층 공간 효율성이 우수하여 임차 수요 확보에 유리합니다.`,
    );
  }

  if (fieldKey === 'investmentPoint3') {
    const vacancySignal = pickStr(overrides.vacancySignal);
    if (tone === 'conservative') {
      return finalize(
        `${ask ? `매매 희망가 ${ask} 기준 ` : ''}${yieldBase ? `현행 임대수익률 ${yieldBase}` : '현행 임대차 계약 구조'}를 유지하고 있으며, ${vacancySignal ? `임대 현황(${vacancySignal}) 및 ` : ''}만기 도래 호실의 재계약 조건에 따라 안정적인 현금흐름 관리가 가능합니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${yieldBase ? `현행 수익률 ${yieldBase}에서 ` : ''}${vacancySignal ? `임대차 재편(${vacancySignal}) 및 ` : ''}공실 해소·저평가 호실 재구조화(Re-tenanting) 실행 시 ${yieldStab ? `안정화 수익률 ${yieldStab}까지 상승 여력이 풍부하며, ` : '임대수익 개선 여력이 풍부하며, '}${ask ? `매매가(${ask}) 대비 ` : ''}우수한 가치개선(Value-add) 자본차익이 기대됩니다.`,
      );
    }
    return finalize(
      `${ask ? `매매 희망가 ${ask} 대비 ` : ''}${yieldBase ? `현행 ${yieldBase}의 안정적 임대수익` : '안정적 임대수익 기반'}을 확보하고 있으며, ${vacancySignal ? `${vacancySignal} 관리 및 ` : ''}임대차 최적화를 통해 ${yieldStab ? `목표 수익률 ${yieldStab} 달성이` : '추가 수익성 제고가'} 기대됩니다.`,
    );
  }

  if (dataKey === 'highlights' || fieldKey === 'leadSentence' || fieldKey === 'keyInvestmentPoint') {
    if (tone === 'conservative') {
      return finalize(
        `${addr} 소재 근린생활·업무시설 자산으로, 공적장부 기준 ${zoning}${landArea ? ` · 대지 ${landArea}` : ''}${grossArea ? ` · 연면적 ${grossArea}` : ''} 제원을 갖추고 있습니다.${yieldBase ? ` 현행 임대차 계약 기준 연 수익률은 ${yieldBase}입니다.` : ''}`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${transit} 역세권 입지와 ${zoning}의 희소성을 겸비한 핵심 수익형 빌딩입니다.${yieldBase ? ` 현행 ${yieldBase}의 안정적 현금흐름에 더해` : ''}${yieldStab ? ` 리테넌팅 및 임대차 재구조화 시 ${yieldStab}까지 가치개선(Value-add) 수익률 상승이 기대됩니다.` : ' 안정적 임차 재편을 통한 중장기 자산가치 제고가 기대됩니다.'}`,
      );
    }
    return finalize(
      `${addr} (${transit}) 입지의 핵심 수익형 자산으로, ${ask ? `매매 희망가 ${ask} 기준 ` : ''}${yieldBase ? `현행 수익률 ${yieldBase}` : '안정적인 임대수익 구조'}${yieldStab ? ` 및 안정화 목표 수익률 ${yieldStab}` : ''}를 동시에 확보할 수 있는 물건입니다.`,
    );
  }

  if (dataKey === 'overview' || fieldKey === 'rightCallout') {
    if (tone === 'conservative') {
      return finalize(
        `• 건축물대장 및 토지이용계획확인원 기준 공적 제원 대조 완료 (${zoning})\n• ${landArea ? `대지면적 ${landArea}` : '대지'} / ${grossArea ? `연면적 ${grossArea}` : '건물'} 규모의 실사용 및 임대 겸용 구조\n• 설비·주차 및 승강기 현황 현장 실사 확인 권장`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `• ${transit} 가시성 우수 코너·역세권 입지로 앵커 임차인 선호도 상위\n• ${zoning} 내 ${landArea ? `대지 ${landArea}` : '핵심 필지'} 확보로 중장기 지가 상승 및 신축·리모델링 잠재력 보유\n• 기준층 평면 효율이 우수하여 법인 사옥 또는 메디컬·클리닉 유치에 적합`,
      );
    }
    return finalize(
      `• 건축물대장·토지이용계획확인서 기반 핵심 제원 검증 완료 (${zoning})\n• ${transit} 접근성 및 배후 상권 수요가 뒷받침되는 안정적 입지\n• 사옥 자가사용 및 임대수익 창출이 모두 가능한 활용도 높은 건물 구조`,
    );
  }

  if (dataKey === 'location' || fieldKey === 'locationCallout') {
    if (tone === 'conservative') {
      return finalize(
        `${addr} 일대는 ${transit}을 중심으로 대중교통 및 간선도로 접근성이 확보된 권역이며, 주변 업무·상업시설과의 연계를 통해 꾸준한 임차 수요가 유지되고 있습니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${transit} 도보권 핵심 동선에 위치하여 상시 유동인구와 직장인 배후 수요를 직접 흡수하는 핵심 상권입니다. 인근 상권 확장과 연계한 지속적인 임대료 현실화 여력이 기대됩니다.`,
      );
    }
    return finalize(
      `${transit} 역세권 교통망과 풍부한 배후 오피스·주거 수요가 결합된 입지로, 공실 리스크가 낮고 임차인 선호도가 높은 핵심 권역입니다.`,
    );
  }

  if (dataKey === 'land' || fieldKey === 'landCallout') {
    if (tone === 'conservative') {
      return finalize(
        `토지이용계획확인원 기준 ${zoning}에 해당하며, 국토의 계획 및 이용에 관한 법률 및 건축법 등 관계 법령에 따른 행위제한 사항을 준수하고 있습니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${zoning} 내 정형화된 필지(${landArea || '핵심 대지'})로 도로 접면 조건과 일조·가시성이 우수하여 향후 증축·리모델링 또는 신축 개발 시 높은 토지 활용 가치를 제공합니다.`,
      );
    }
    return finalize(
      `${zoning} 적용 필지로서 공시지가의 우상향 흐름을 보이고 있으며, 현행 건축물 활용과 중장기 토지 가치 보존 측면에서 모두 양호한 조건을 갖추고 있습니다.`,
    );
  }

  if (dataKey === 'rentroll' || fieldKey === 'turnaroundStrategy' || fieldKey === 'rentrollNotes') {
    if (tone === 'conservative') {
      return finalize(
        `현행 임대차 계약 조건(보증금 ${pickStr(overrides.depositTotal, '-')}, 월임대료 ${pickStr(overrides.monthlyRentTotal, '-')})을 기준으로 작성되었으며, 만기 도래 호실의 재계약 조건에 따라 수익률이 변동될 수 있습니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `저평가된 기존 임대차 호실의 만기 도래 시 인근 시세 수준으로 임대료를 현실화하고, 공실·자가사용 층에 안정적 근생·오피스 임차인을 유치하여 ${yieldStab ? `안정화 수익률 ${yieldStab}` : '목표 수익률'} 달성이 가능합니다.`,
      );
    }
    return finalize(
      `현행 임대 가동률(${pickStr(overrides.occupancyRate, '안정 수준')})을 바탕으로 안정적인 월 현금흐름을 창출 중이며, 단계적 임대차 재구성을 통해 추가적인 수익성 제고가 가능한 구조입니다.`,
    );
  }

  if (dataKey === 'yield' || fieldKey === 'stabilizedAssumption' || fieldKey === 'yieldNotes') {
    const totalDep = pickStr(overrides.totalDeposit);
    const annRent = pickStr(overrides.annualRent);
    const pricePerPy = pickStr(overrides.pricePerPyeong);
    if (tone === 'conservative') {
      return finalize(
        `${ask ? `매매 희망가 ${ask}` : '매매가'}${totalDep ? `, 총 보증금 ${totalDep}` : ''}${annRent ? `, 연 임대수입 ${annRent}` : ''} 기준 ${yieldBase ? `현행 Cap Rate ${yieldBase}` : '실투자금 대비 수익률'}${pricePerPy ? ` (평당 ${pricePerPy})` : ''}로 산정되었으며, 최근 개별공시지가 추이 및 공적장부 제원을 바탕으로 보수적 하방 안정성을 검토하였습니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${pricePerPy ? `토지 평당가 ${pricePerPy} 수준의 가격 경쟁력과 ` : ''}${ask ? `매매가 ${ask} 대비 ` : ''}공시지가의 우상향 추이가 하방 경직성을 지지하며, 공실 해소 및 주변 시세 수준 재계약 시 ${yieldBase ? `현행 ${yieldBase}에서 ` : ''}${yieldStab ? `안정화 수익률 ${yieldStab}` : '목표 수익률'}까지 수익률 개선 여력이 기대됩니다.`,
      );
    }
    return finalize(
      `${ask ? `매매 희망가 ${ask}` : '매매가'}${totalDep ? ` (보증금 ${totalDep} 차감 실투자금 기준)` : ''}${annRent ? ` · 연 임대수입 ${annRent}` : ''} 대비 ${yieldBase ? `현행 수익률 ${yieldBase}` : '안정적 현금흐름'}${yieldStab ? ` 및 안정화 기대수익률 ${yieldStab}` : ''}를 확보할 수 있으며, 공시지가 추세를 감안할 때 임대수익과 중장기 지가 보존을 동시에 기대할 수 있습니다.`,
    );
  }

  if (dataKey === 'comps' || fieldKey === 'compsNotes') {
    const targetPy = pickStr(overrides.targetLandPricePerPy) || pickStr(overrides.pricePerPyeong);
    if (tone === 'conservative') {
      return finalize(
        `국토교통부 실거래가 공개시스템 및 ${addr} 인근 ${zoning} 내 유사 거래사례를 기준으로 작성되었으며,${targetPy ? ` 본건 토지 평당가(${targetPy})와` : ''} 개별 필지의 도로 접면·용적률 조건 차이를 감안한 비교 검토가 필요합니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `${addr} 핵심 권역 내 동일 ${zoning} 실거래 사례 대비${targetPy ? ` 본건 토지 평당가(${targetPy})는` : ''} 합리적인 가격 메리트를 보유하고 있어, 매입 시 하방 안전마진 확보 및 향후 매각(Exit) 시 자본차익 여력이 기대됩니다.`,
      );
    }
    return finalize(
      `${addr} 일대 ${zoning} 내 최근 매매 실거래 및 시장 호가 사례를 종합할 때,${targetPy ? ` 본건 토지 평당가(${targetPy})는` : ' 본건 매매 조건은'} 입지 및 건물 제원 대비 합리적인 가격 경쟁력을 갖춘 것으로 판단됩니다.`,
    );
  }

  if (dataKey === 'closing' || fieldKey === 'closingLine') {
    if (tone === 'conservative') {
      return finalize(
        `${buildingName} 관련 상세 공부 서류 열람 및 현장 실사 일정 조율은 아래 담당 중개법인에 문의해 주시기 바랍니다.`,
      );
    }
    if (tone === 'aggressive') {
      return finalize(
        `검증된 입지와 가치개선(Value-add) 잠재력을 갖춘 ${buildingName}의 우선 매수 검토 및 투자의향서(LOI) 제출 관련 사항은 전담 자문팀으로 문의해 주시기 바랍니다.`,
      );
    }
    return finalize(
      `${buildingName} 매입 검토, 상세 임대차 내역 확인 및 현장 실사 예약은 아래 담당 중개법인에 문의해 주시면 신속히 안내해 드리겠습니다.`,
    );
  }

  if (!currentText.trim()) {
    return finalize(`${buildingName} (${addr}) 핵심 투자 검토 사항 — 공적장부 및 현장 실사 기반 요약`);
  }
  if (tone === 'conservative') {
    return finalize(`${currentText.trim()} (공적장부 및 현행 계약 기준 확인)`);
  }
  if (tone === 'aggressive') {
    return finalize(`${currentText.trim()} — 입지 희소성 및 임대차 재구조화를 통한 중장기 가치 제고 기대`);
  }
  return finalize(currentText.trim());
}

async function tryRefineWithSotaLlm(params: {
  dataKey: string;
  fieldKey: string;
  currentText: string;
  tone: ToneOption;
  overrides: Record<string, unknown>;
  buildingContext: Record<string, unknown>;
  buildingName: string;
  tenantPoolSource: ReadonlyArray<unknown>;
}): Promise<string | null> {
  const {
    dataKey,
    fieldKey,
    currentText,
    tone,
    overrides,
    buildingContext,
    buildingName,
    tenantPoolSource,
  } = params;

  const canonicalPosture = mapWorkspacePostureToCanonical(
    pickStr(overrides.posture) ||
      pickStr(buildingContext.posture) ||
      pickStr(buildingContext.investmentPosture),
  );
  const rawPriceManwon = Number(
    buildingContext.askingPriceManwon || overrides.askingPriceManwon || 0,
  );
  const goldenBand = askingPriceManwonToGoldenBand(rawPriceManwon);
  const assetType = inferAssetTypeCode(
    pickStr(overrides.zoning) || pickStr(buildingContext.zoning),
    buildingName,
    currentText,
  );
  const sectionType = mapStudioDataKeyToSectionType(dataKey, fieldKey);

  const refBlock = await fetchDynamicImReferenceBlock({
    assetType,
    priceBand: goldenBand,
    posture: canonicalPosture,
    sectionType,
    address: String(overrides.address || buildingContext.address || ''),
    buildingName,
    timeoutMs: 1500,
  });

  const isBulletCallout =
    dataKey === 'overview' || fieldKey === 'rightCallout' || currentText.includes('•');
  const formatInstruction = isBulletCallout
    ? '출력 형식: "• " 불릿 기호로 시작하는 3줄 요약(줄바꿈 \\n 구분, 각 줄 48자 이내)으로 작성하세요.'
    : '출력 형식: 1~2문장(공백 포함 160자 이내)의 완결된 전문 IM 산문으로 작성하세요. 불필요한 따옴표나 머리말 없이 정제된 본문만 반환하세요.';

  const ssotSummaryLines = Object.entries({
    건물명: buildingName,
    소재지: overrides.address || buildingContext.address,
    매매희망가: overrides.askingPrice,
    대지면적: overrides.landArea,
    연면적: overrides.grossArea,
    용도지역: overrides.zoning || overrides.zoningInfo,
    층수규모: overrides.floors,
    건폐율용적률: overrides.bcrFar,
    교통여건: overrides.transitInfo,
    현행수익률: overrides.grossYield || overrides.capRateBase,
    안정화수익률: overrides.stabilizedYield || overrides.capRateStabilized,
    보증금합계: overrides.depositTotal || overrides.totalDeposit,
    월임대료합계: overrides.monthlyRentTotal,
    연임대수입: overrides.annualRent,
    임대가동률: overrides.occupancyRate || overrides.vacancySignal,
    토지평당가: overrides.targetLandPricePerPy || overrides.pricePerPyeong,
  })
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${String(v).trim()}`);

  const systemPrompt = [
    `당신은 한국 상업용 부동산(CRE) 기관용 투자설명서(IM) 수석 에디터입니다.`,
    `슬라이드 영역("${dataKey}" / "${fieldKey}")의 문구를 선택된 톤앤매너에 맞춰 정제하세요.`,
    ``,
    `[적용 톤앤매너]`,
    TONE_GUIDELINES[tone] || TONE_GUIDELINES.balanced,
    ``,
    `[절대 준수 원칙]`,
    `1. [중개인 현장 팩트 보존]: 중개인이 작성한 현재 초안(currentText)에 구체적 사실(임차 업종·상호, 장기계약 연수, 리모델링 이력, 명도 조건 등)이 있다면 절대 누락하지 말고 핵심 논거로 살려 문장을 다듬으세요.`,
    `2. [암산·날조 금지]: 제공된 [본건 SSOT 제원]과 [중개인 현재 초안]에 없는 숫자(수익률 %, 금액, 평수, 거리, 연도)나 유명 프랜차이즈 상호(스타벅스, 올리브영 등)는 절대 창작하지 마세요.`,
    `3. [표준 CRE 금융 어휘 & 암묵적 페르소나]: '60대 자산가', '은퇴 부부', '법인 대표 맞춤' 등 노골적 독자 지칭을 금지하고, '세입자'→'임차인', '올수리'→'전면 리모델링', '수익 극대화/확실한 수익'→'수익성 제고/예상 현금흐름' 등 표준 CRE 용어를 사용하세요.`,
    `4. ${formatInstruction}`,
    refBlock.postureOverlay ? `\n[포스처 지침]\n${refBlock.postureOverlay}` : '',
    refBlock.fewShotBlock
      ? `\n[우수 IM 문체 레퍼런스 (수치·상호 복사 금지)]\n${refBlock.fewShotBlock}`
      : '',
    refBlock.ragStyleSnippet ? `\n${refBlock.ragStyleSnippet}` : '',
    ``,
    `응답은 반드시 아래 JSON 형식으로 반환하세요:`,
    `{ "refinedText": "..." }`,
  ]
    .filter(Boolean)
    .join('\n');

  const baseUserPrompt = [
    `[본건 SSOT 제원]`,
    ssotSummaryLines.length > 0 ? ssotSummaryLines.join('\n') : `- 건물명: ${buildingName}`,
    ``,
    `[중개인 현재 초안 (currentText)]`,
    currentText.trim() ? currentText.trim() : '(초안 없음 — 본건 SSOT 제원을 바탕으로 신규 작성)',
  ].join('\n');

  const numberAllowlistContext = [
    JSON.stringify(overrides),
    JSON.stringify(buildingContext),
    currentText,
    '1 2 3 10 100',
  ].join('\n');

  let repairFeedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const userPrompt = repairFeedback ? `${baseUserPrompt}\n\n${repairFeedback}` : baseUserPrompt;
    const llmResult = await callLLM(
      {
        systemPrompt,
        userPrompt,
        model: getModel('terra'),
        temperature: 0.3,
        responseFormat: 'json_object',
      },
      { allowMock: false },
    );

    if ((llmResult as { isMock?: boolean }).isMock) return null;
    const rawContent = typeof llmResult.content === 'string' ? llmResult.content.trim() : '';
    if (!rawContent) {
      repairFeedback = '[자가 교정 지시] 직전 응답이 비어 있었습니다. { "refinedText": "..." } JSON을 반환하세요.';
      continue;
    }

    let candidate = '';
    try {
      const parsed = JSON.parse(rawContent) as { refinedText?: string };
      candidate = String(parsed?.refinedText ?? '').trim();
    } catch {
      repairFeedback = '[자가 교정 지시] 유효한 JSON 형식으로 { "refinedText": "..." } 만 반환하세요.';
      continue;
    }

    if (!candidate) {
      repairFeedback = '[자가 교정 지시] refinedText 필드에 정제된 문구를 채워 반환하세요.';
      continue;
    }

    const val = validateImGeneratedCopy(candidate, {
      numberContext: numberAllowlistContext,
      tenantPoolSource,
      maxChars: isBulletCallout ? 240 : 220,
    });

    if (val.ok || attempt === 2) {
      const polished = sanitizeRefinedText(
        await polishImCopyWithLexicon(candidate, {
          tenantPoolSource,
          preserveLinesAndMarkdown: true,
        }),
      );
      if (!polished) return null;
      // 2차 시도 후에도 미근거 숫자가 남아 있으면 안전하게 결정론적 폴백으로 이관
      if (findNumbersNotInContext(polished, numberAllowlistContext).length > 0) {
        return null;
      }
      return polished;
    }

    repairFeedback = buildImRepairFeedback({
      ungroundedNumbers: val.ungroundedNumbers,
      fabricatedBrands: val.fabricatedBrands,
      forbiddenHits: val.forbiddenHits,
      lengthNote: val.exceedsLength ? '공백 포함 180자 이내로 간결하게 압축하세요.' : undefined,
    });
  }

  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const isTestBypass = Boolean(
    process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'),
  );
  let studioGuard: AuthGuardResult | null = null;
  if (!isTestBypass) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const {
      slideId,
      dataKey = 'highlights',
      fieldKey = 'keyInvestmentPoint',
      currentText = '',
      tone = 'balanced',
    } = body as {
      slideId?: string;
      dataKey?: string;
      fieldKey?: string;
      currentText?: string;
      tone?: ToneOption;
    };

    let project;
    try {
      project = await studioService.getProject(id);
    } catch {
      project = await studioService.findProjectByDealId(id);
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project ? project.dealId : id);
    if (denied) return denied;

    const slide = project?.slides.find((s) => s.id === slideId || s.dataKey === dataKey);
    const overrides = Object.assign(
      {},
      ...(project?.slides || []).map((s) => s.slideOverrides || {}),
      slide?.slideOverrides || {},
      body?.overrides && typeof body.overrides === 'object' ? body.overrides : {},
    ) as Record<string, unknown>;
    const buildingContext = (project?.buildingContext ?? {}) as Record<string, unknown>;
    const buildingName =
      pickStr(buildingContext.buildingName) ||
      project?.title?.replace(/\s*Basic\s*IM$/i, '') ||
      '본건 빌딩';

    const tenantPoolSource = [
      { tenant_name: currentText },
      { tenant_name: JSON.stringify(overrides) },
      { tenant_name: JSON.stringify(buildingContext) },
    ];

    const deterministicText = buildDeterministicRefinement(
      dataKey,
      fieldKey,
      currentText,
      tone,
      overrides,
      buildingName,
      tenantPoolSource,
    );

    if (!isTestBypass && !isDeterministicLLMMode()) {
      try {
        const llmRefined = await tryRefineWithSotaLlm({
          dataKey,
          fieldKey,
          currentText,
          tone,
          overrides,
          buildingContext,
          buildingName,
          tenantPoolSource,
        });
        if (llmRefined) {
          return NextResponse.json({
            ok: true,
            refinedText: llmRefined,
            tone,
            fieldKey,
            source: 'llm',
          });
        }
      } catch (llmErr: unknown) {
        if (llmErr instanceof LLMMockNotAllowedError) {
          log.warn('[studio/ai-text] LLM Mock 거부 — 결정론적 SSOT 폴백 전환');
        } else {
          log.warn('[studio/ai-text] LLM 정제 실패 — 결정론적 SSOT 폴백 전환:', llmErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      refinedText: deterministicText,
      tone,
      fieldKey,
      source: 'deterministic_fallback',
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'AI 문구 다듬기에 실패했습니다.';
    return NextResponse.json(
      { ok: false, error: errMsg },
      { status: 500 },
    );
  }
}
