import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import { z } from "zod/v4";
import {
  normalizeTextParsedRentRoll,
  type TextParsedFloorLease,
} from "@/lib/rentroll/text-parse-normalize";
import { parseTsvRentRoll, type RentRollRowItem } from "@/lib/rent-roll/tsv-parser";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


const FloorLeaseSchema = z.object({
  floor: z.string(),
  unit_label: z.string().nullish().transform((v) => v?.trim() || undefined),
  tenant_type: z.string().nullish().transform((v) => v ?? undefined),
  tenant_name: z.string().nullish().transform((v) => v ?? undefined),
  deposit_manwon: z.number().nullish().transform((v) => v ?? undefined),
  rent_manwon: z.number().nullish().transform((v) => v ?? undefined),
  mgmt_fee_manwon: z.number().nullish().transform((v) => v ?? undefined),
  is_vacant: z.boolean().nullish().transform((v) => v ?? undefined),
  lease_state: z.string().nullish().transform((v) => v ?? undefined),
  note: z.string().nullish().transform((v) => v?.trim() || undefined),
  area_sqm: z.number().nullish().transform((v) => v ?? undefined),
  exclusive_area_sqm: z.number().nullish().transform((v) => v ?? undefined),
  contract_group: z.string().nullish().transform((v) => v?.trim() || undefined),
  legal_basis: z.string().nullish().transform((v) => v?.trim() || undefined),
  first_contract_date: z.string().nullish().transform((v) => v?.trim() || undefined),
  renewal_exercised: z.string().nullish().transform((v) => v?.trim() || undefined),
  opposing_power: z.string().nullish().transform((v) => v?.trim() || undefined),
  evidence_level: z.string().nullish().transform((v) => v?.trim() || undefined),
  rent_free_months: z.number().nullish().transform((v) => v ?? undefined),
  payment_status: z.string().nullish().transform((v) => v?.trim() || undefined),
  lease_start: z.string().nullish().transform((v) => v ?? undefined),
  lease_end: z.string().nullish().transform((v) => v ?? undefined),
});

const ParseResultSchema = z.object({
  floorLeases: z.array(FloorLeaseSchema),
  monthlyRent: z.number(),
  totalDeposit: z.number(),
  mgmtFeeTotal: z.number(),
  vacancyPct: z.number(),
});

const SYSTEM_PROMPT = `당신은 상업용 부동산 렌트롤(임대차 현황) 텍스트를 구조화된 JSON으로 변환하는 전문 파서입니다.

사용자가 자유로운 형식의 텍스트로 임대차 현황을 입력합니다. 다양한 형식을 지원해야 합니다:

## 입력 예시들
- 간략형: "B1 라이브펍(5,000/450), 1F 카페(8,000/600), 2F 공실"
- 표형: "1층 스타벅스 보증금 1억 월세 800만, 2층 사무실 5000/300"
- 상세형: "1층 101호 약국(고은약국) 임대 65㎡ 전용 52㎡ 보증금 8000만원 월세 600만원 관리비 50만원 계약기간 2023.03~2026.02"

## 호실(unit_label) 및 면적 규칙
- "1F 101호", "2층 202호", "B1 B101호" 처럼 구분 호실이 명시되어 있으면 floor 는 물리 층("1F", "2F", "B1"), unit_label 은 호실("101호", "202호", "B101호")로 분리하고, 전층 단일 계약처럼 호실 표기가 없으면 unit_label 은 생략 (임의로 101호 등을 만들어내지 말 것)
- 임대면적은 area_sqm(㎡), 전용면적은 exclusive_area_sqm(㎡)에 기재 (평으로 적혀 있으면 × 3.305785 로 ㎡ 환산)

## 금액 규칙
- 금액 단위는 만원(manwon)으로 통일
- "1억" = 10000만원, "5천만원" = 5000만원
- "보증금/월세" 형식: 괄호 안 (보증금/월세)
- 관리비가 명시되지 않으면 mgmt_fee_manwon 필드를 생략 (0 으로 채우지 말 것 — 명시적 "관리비 0/없음"만 0)

## 공실 판별 (중요)
- 입력에 "공실", "비어있음", "vacant" 이 **명시된** 호실만 is_vacant: true, lease_state: "공실"
- 월세 0원/금액 미기재만으로 공실로 판단하지 말 것. 아래는 공실이 **아니다**:
  - 자가사용: "자가", "사옥", "직영", "본사", "오너" 표기 호실 → lease_state: "자가사용", is_vacant: false
  - 통합계약: "○○(통합계약)" 처럼 같은 임차인이 여러 호실/층을 하나의 계약으로 쓰고 금액은 대표 행에만 적힌 후행 호실 → is_vacant: false, lease_state: "임대중", 임차인 상호는 대표 행과 동일하게 tenant_name 에 기재, 통합계약 그룹명이 있으면 contract_group 에 기재
- 그 외 임차 중인 호실은 lease_state: "임대중"

## 임차인 상호 및 추가 원장 필드
- 입력에 상호(예: 고은약국, 로뎀나무내과, 국제와인)가 있으면 반드시 tenant_name 에 **그대로** 보존하고, 업종은 tenant_type 에 기재 (상호를 업종으로 바꾸거나 생략하지 말 것)
- 상호가 없고 업종만 있으면 tenant_name 은 생략
- 비고/특이사항은 note, 적용법령("상가"|"주택"|"미확인")은 legal_basis, 최초계약일은 first_contract_date(YYYY-MM-DD), 갱신요구권 행사("있음"|"없음"|"모름")는 renewal_exercised, 대항력("사업자등록"|"주민등록"|"미확인")은 opposing_power, 근거("계약서 원본"|"매도인 렌트롤"|"구두")는 evidence_level, 렌트프리 잔여 개월은 rent_free_months(정수), 입금확인("정상"|"연체"|"미확인")은 payment_status 에 명시된 경우에만 기재 (미기재 시 생략)
- "[예시]" 또는 "예시 행" 으로 표시된 가이드 행은 결과에서 제외할 것

반드시 아래 JSON 형식으로만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요:
{
  "floorLeases": [
    {
      "floor": "층 (예: B1, 1F, 2F)",
      "unit_label": "호실 (예: 101호, 202호 — 전층 등 미기재 시 생략)",
      "tenant_type": "업종 (예: 카페, 사무실, 공실)",
      "tenant_name": "임차인/상호명 (예: 스타벅스) — 미기재 시 생략",
      "deposit_manwon": 보증금(만원),
      "rent_manwon": 월세(만원),
      "mgmt_fee_manwon": 관리비(만원, 미기재 시 생략),
      "is_vacant": true/false,
      "lease_state": "임대중" | "공실" | "자가사용",
      "area_sqm": 임대면적(㎡, 미기재 시 생략),
      "exclusive_area_sqm": 전용면적(㎡, 미기재 시 생략),
      "contract_group": "통합계약 그룹명 (미기재 시 생략)",
      "legal_basis": "상가 | 주택 | 미확인 (미기재 시 생략)",
      "first_contract_date": "최초계약일 (YYYY-MM-DD, 미기재 시 생략)",
      "lease_start": "계약시작일 (YYYY-MM-DD, 미기재 시 생략)",
      "lease_end": "계약종료일 (YYYY-MM-DD, 미기재 시 생략)",
      "renewal_exercised": "있음 | 없음 | 모름 (미기재 시 생략)",
      "opposing_power": "사업자등록 | 주민등록 | 미확인 (미기재 시 생략)",
      "evidence_level": "계약서 원본 | 매도인 렌트롤 | 구두 (미기재 시 생략)",
      "rent_free_months": 렌트프리_잔여개월(정수, 미기재 시 생략),
      "payment_status": "정상 | 연체 | 미확인 (미기재 시 생략)",
      "note": "비고/특이사항 (미기재 시 생략)"
    }
  ],
  "monthlyRent": 총 월임대료(만원),
  "totalDeposit": 총 보증금(만원),
  "mgmtFeeTotal": 총 관리비(만원),
  "vacancyPct": 공실률(0~100 숫자)
}`;

function isStructuredTableInput(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return false;

  const tabLines = lines.filter((l) => l.includes("\t") && l.split("\t").length >= 2);
  if (tabLines.length >= 1 && tabLines.length >= Math.ceil(lines.length / 2)) {
    return true;
  }

  const pipeLines = lines.filter(
    (l) => l.startsWith("|") && l.endsWith("|") && l.slice(1, -1).split("|").length >= 2,
  );
  if (pipeLines.length >= 2) {
    return true;
  }

  return false;
}

function mapTsvRowsToFloorLeases(rows: RentRollRowItem[]): TextParsedFloorLease[] {
  return rows.map((r) => {
    const isVacant = r.status === "vacant";
    const leaseState = isVacant ? "공실" : r.status === "owner" ? "자가사용" : "임대중";
    let tenantType = r.use;
    if (r.tenantName && tenantType.startsWith(`${r.tenantName} / `)) {
      tenantType = tenantType.slice(`${r.tenantName} / `.length).trim() || tenantType;
    }
    const rawExpiry = (r.leaseExpiry ?? "").trim();
    const leaseEnd = rawExpiry && rawExpiry !== "-" ? rawExpiry : undefined;
    return {
      floor: r.floor,
      ...(r.unit ? { unit_label: r.unit } : {}),
      tenant_type: isVacant ? "공실" : tenantType,
      ...(r.tenantName ? { tenant_name: r.tenantName } : {}),
      ...(r.areaSqm != null ? { area_sqm: r.areaSqm } : {}),
      ...(r.exclusiveAreaSqm != null ? { exclusive_area_sqm: r.exclusiveAreaSqm } : {}),
      deposit_manwon: r.depositManwon,
      rent_manwon: isVacant ? 0 : r.monthlyRentManwon,
      mgmt_fee_manwon: isVacant ? 0 : r.maintenanceManwon,
      ...(leaseEnd ? { lease_end: leaseEnd } : {}),
      is_vacant: isVacant,
      lease_state: leaseState,
      ...(r.note ? { note: r.note } : {}),
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json(
        { error: "렌트롤 텍스트를 입력해 주세요." },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();

    if (isStructuredTableInput(trimmedText)) {
      const tsvParsed = parseTsvRentRoll(trimmedText);
      if (tsvParsed.rows.length === 0) {
        return NextResponse.json(
          { error: "유효한 호실 데이터가 없습니다 (예시 행·합계 행은 자동 제외됩니다)." },
          { status: 400 }
        );
      }
      const floorLeases = mapTsvRowsToFloorLeases(tsvParsed.rows);
      return NextResponse.json(
        normalizeTextParsedRentRoll({
          floorLeases,
          monthlyRent: tsvParsed.totalMonthlyRentManwon,
          totalDeposit: tsvParsed.totalDepositManwon,
          mgmtFeeTotal: tsvParsed.totalMaintenanceManwon,
          vacancyPct: 0,
        })
      );
    }

    const result = await callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: trimmedText,
      model: getModel("luna"),
      temperature: 0.1,
      maxTokens: 4096,
    }, { allowMock: process.env.NODE_ENV === 'test' });

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = result.content.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr);
    const validated = ParseResultSchema.parse(parsed);

    // 점유 상태·합계·공실률은 LLM 산술/추정을 믿지 않고 렌트롤 행에서 결정론적으로 재산출 (자가사용·통합계약 후행 ≠ 공실)
    return NextResponse.json(normalizeTextParsedRentRoll(validated));
  } catch (err: any) {
    log.error("[rent-roll/parse-text] Error:", err);
    if (err?.name === "LLMMockNotAllowedError") {
      // AI 쿼터/키 문제 — 샘플(Mock) 렌트롤을 실제 데이터처럼 돌려주지 않고 명확히 실패 처리
      return NextResponse.json(
        { error: "AI 분석 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err.message || "렌트롤 파싱에 실패했습니다." },
      { status: 400 }
    );
  }
}
