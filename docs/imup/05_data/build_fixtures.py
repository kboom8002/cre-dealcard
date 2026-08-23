#!/usr/bin/env python3
"""실매물 5건 테스트 픽스처 생성 — D14 §3 / D15 §2

원칙
  1. 숫자는 실측 그대로. 한 자리도 바꾸지 않는다.
  2. 상호·물건명은 마스킹한다. 업종은 원문을 남긴다 (G17 테스트에 필요).
  3. 주소는 동까지. 지번은 넣지 않는다.
  4. asOf(렌트롤 기준일)를 픽스처에 박는다. 없으면 null — 만들어내지 않는다.
"""
import json, os
from datetime import date

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
os.makedirs(OUT, exist_ok=True)

M = 1_000_000
K = 1_000


def row(unit, biz, area, dep, rent, mgmt, start, expiry, state='임대중',
        group=None, basis='상가', note=None):
    return {
        'unitLabel': unit, 'contractGroup': group, 'leaseAreaSqm': area,
        'tenantBusiness': biz, 'legalBasis': basis,
        'depositKrw': dep, 'monthlyRentKrw': rent, 'mgmtFeeKrw': mgmt,
        'firstContractDate': None,          # ★ 실측에 없음 — 채우지 않는다
        'currentStartDate': start, 'currentExpiryDate': expiry,
        'renewalExercised': '모름', 'opposingPower': '미확인',
        'leaseState': state, 'note': note,
    }


# ── 1. 양평동 (income · R2 · 12행) ───────────────────────────────────────
YANGPYEONG = {
    'fixtureId': 'yangpyeong',
    'maskNote': '물건명 마스킹 · 업종은 원문 유지 · 지번 제외',
    'asset': {
        'assetId': 'FX-YP-001',
        'addressBand': '서울특별시 영등포구 양평동4가',
        'buildingUse': '업무시설',
        'assetType': 'office',
        'totalFloorAreaSqm': 2490.88,
        'farBaseAreaSqm': 2068.63,
        'buildingCoverageRatio': 58.4,
        'floorAreaRatio': 398.8,
    },
    'posture': 'income',
    'financial': {
        'priceKrw': 25_000 * M,
        'depositKrw': 495 * M,
        'monthlyRentKrw': 46_570 * K,
        'mgmtFeeKrw': 5_760 * K,
        'opexKrw': None,                    # ★ 미제출 — NOI 계열 미산출
        'loanKrw': None, 'loanRate': None,
        'brokerFeeKrw': None, 'otherCostKrw': None,
    },
    'ledger': {
        'asOf': None,                       # ★ 렌트롤 기준일 미기재 (실측)
        'statedMonthlyRent': 50_170 * K,    # 표지 요약 (원장과 불일치)
        'statedDepositKrw': 535 * M,
        'statedMgmtFeeKrw': 6_480 * K,
        'statedTotalAreaSqm': 2490.88,
        'rows': [
            row('10F', '운동시설',     None, 43 * M, 4_590 * K, 510 * K, '2022-10-01', '2024-09-30'),
            row('9F(2)', '사무실',      None, 30 * M, 3_000 * K, 430 * K, '2023-12-01', '2025-11-30'),
            row('9F(1)', '스튜디오렌탈', None, 20 * M, 1_990 * K, 220 * K, '2023-11-01', '2025-10-31'),
            row('8F', '사무실',        None, 50 * M, 5_600 * K, 800 * K, '2023-09-08', '2025-09-07'),
            row('7F', '사무실',        None, 50 * M, 5_880 * K, 620 * K, '2023-10-04', '2025-10-03'),
            row('6F', '사무실',        None, 40 * M, 4_830 * K, 690 * K, '2024-03-01', '2026-02-28'),
            row('5F', '사무실',        None, 57 * M, 5_280 * K, 660 * K, '2022-05-30', '2024-05-29'),
            row('4F', '사무실',        None, 50 * M, 4_400 * K, 550 * K, '2022-06-30', '2024-06-29'),
            row('3F', '치과',          None, 70 * M, 3_100 * K, 530 * K, '2022-11-01', '2024-10-31'),
            row('2F', '미용실',        None, 50 * M, 5_400 * K, 600 * K, '2024-02-22', '2026-02-21'),
            row('1F', '부동산',        None, 35 * M, 2_500 * K, 150 * K, '2023-11-11', '2025-11-11'),
            row('B1', None, 422.25, None, None, None, None, None,
                state='공실', basis='미확인', note='공실 · 리스업 대상'),
        ],
    },
    'attachedDocs': [
        {'kind': '토지이용계획원', 'addressBand': '서울특별시 강남구 논현동'},   # ★ 오첨부 (실측)
    ],
    'expect': {
        'ledgerRows': 12,
        'sumDepositKrw': 495 * M,
        'sumMonthlyRentKrw': 46_570 * K,
        'sumMgmtFeeKrw': 5_760 * K,
        'resolution': 'R2',
        'yields': {'gross_price': 2.24, 'gross_price_deposit': 2.28},
        'noiBasesAbsent': True,
        'equity': {
            'acquisitionTax': 1_150 * M, 'brokerFee': 225 * M,
            'totalAcquisitionCost': 26_375 * M, 'equityNoLoan': 25_880 * M,
        },
        'ltv': [
            {'ltv': 0.0, 'loan': 0,          'equity': 25_880 * M, 'monthlyNet':  46_570 * K, 'roe': 2.16},
            {'ltv': 0.4, 'loan': 10_000 * M, 'equity': 15_880 * M, 'monthlyNet':   9_070 * K, 'roe': 0.69},
            {'ltv': 0.5, 'loan': 12_500 * M, 'equity': 13_380 * M, 'monthlyNet':    -305 * K, 'roe': -0.03},
        ],
        'negativeLeverage': True,
        'gatesBlocking': ['G19', 'G21'],
        'gatesWarning': ['G18'],
        'gatesNotEvaluable': ['F12', 'F13'],     # asOf 없음 → 신선도 판정 불가
        'archetypeA03Slides': 1,
    },
}

# ── 2. 당산동 (income · R1 · 8행 · 통합계약) ──────────────────────────────
DANGSAN = {
    'fixtureId': 'dangsan',
    'maskNote': '상호 마스킹(약국A 등) · 업종 유지 · 물건명 제외',
    'asset': {
        'assetId': 'FX-DS-001',
        'addressBand': '서울특별시 영등포구 당산동5가',
        'buildingUse': '제2종근린생활시설',
        'assetType': 'small_building',
        'totalFloorAreaSqm': None,          # ★ 미확정 (표가 자기모순)
    },
    'posture': 'income',
    'financial': {
        'priceKrw': 11_500 * M,
        'depositKrw': 290 * M,
        'monthlyRentKrw': 19_460 * K,
        'mgmtFeeKrw': None,
        'opexKrw': None,
        'loanKrw': None, 'loanRate': None,
        'brokerFeeKrw': None, 'otherCostKrw': None,
    },
    'ledger': {
        'asOf': '2025-05-01',
        'statedTotalAreaSqm': 1141.15,      # ★ 행 합 1441.15와 300.00 불일치
        'statedMonthlyRent': 19_460 * K,
        'rows': [
            row('B1', '카페',   317.22, None,    None,      None, None, None,
                state='자가사용', basis='미확인', note='소유자 직접 운영'),
            row('1F', '약국',    78.39,  60 * M, 1_830 * K, None, None, '2026-08-31', group='A'),
            row('1F', '의원',   105.60, 140 * M, 8_830 * K, None, None, '2026-08-31', group='B',
                note='1F+2F 통합계약 · 금액은 대표 행'),
            row('2F', '의원',   252.09, None,    None,      None, None, '2026-08-31', group='B',
                note='B그룹 · 금액은 1F 행'),
            row('3F', '헬쓰장', 252.09,  50 * M, 4_550 * K, None, None, '2026-04-17', group='C'),
            row('4F', '주류판매', 169.06, 30 * M, 2_600 * K, None, None, '2025-04-30', group='D',
                note='IM 작성 시점에 이미 만료'),
            row('4F', None,      83.03, None,    None,      None, None, None,
                state='자가사용', basis='미확인', note='임대 전환 대상'),
            row('5F', '의원',   183.67,  10 * M, 1_650 * K, None, None, '2026-08-31', group='E',
                note='별도 계약'),
        ],
    },
    'attachedDocs': [],
    'expect': {
        'ledgerRows': 8,
        'sumAreaSqm': 1441.15,
        'areaGapSqm': 300.00,
        'sumDepositKrw': 290 * M,
        'sumMonthlyRentKrw': 19_460 * K,
        'liveRows': 6, 'selfUseRows': 2, 'vacantRows': 0,
        'vacancyPct': 0.0,                  # ★ 자가사용은 분모·분자 모두 제외
        'resolution': 'R1',
        'yields': {'gross_price': 2.03, 'gross_price_deposit': 2.08},
        'noiBasesAbsent': True,
        'equity': {
            'acquisitionTax': 529 * M, 'brokerFee': 103_500_000,
            'totalAcquisitionCost': 12_132_500_000, 'equityNoLoan': 11_842_500_000,
        },
        'ltv': [
            {'ltv': 0.0, 'loan': 0,         'equity': 11_842_500_000, 'monthlyNet': 19_460 * K, 'roe': 1.97},
            {'ltv': 0.4, 'loan': 4_600 * M, 'equity':  7_242_500_000, 'monthlyNet':  2_210 * K, 'roe': 0.37},
            {'ltv': 0.5, 'loan': 5_750 * M, 'equity':  6_092_500_000, 'monthlyNet': -2_102_500, 'roe': -0.41},
        ],
        'negativeLeverage': True,
        'gatesBlocking': ['C19'],
        'gatesWarning': ['G18'],
        'contractGroups': ['A', 'B', 'C', 'D', 'E'],
        'archetypeA03Slides': 1,
    },
}

# ── 3. 잠원동 (development · hold · R1) ──────────────────────────────────
JAMWON = {
    'fixtureId': 'jamwon',
    'maskNote': '물건명 제외 · 층별 공부 정보만',
    'asset': {
        'assetId': 'FX-JW-001',
        'addressBand': '서울특별시 서초구 잠원동',
        'zoning': '제2종일반주거지역',
        'assetType': 'small_building',
        'landPyeong': 616.1,
    },
    'posture': 'development',
    'devMode': 'hold',
    'vacateResponsibility': 'seller',        # ★ 매도인 명도 → 최소 해상도 R1
    'financial': {
        'purchaseCostKrw': 24_227 * M,
        'constructionCostKrw': 7_368 * M,
        'contingencyKrw': 500 * M,
        'targetFarPct': None,                # ★ 조회 실패 시나리오
        'buildPyeong': 614.01,
    },
    'stacking': [
        {'floor': '6F', 'pyeong': 50.00, 'perPyeongKrw': 180_000, 'monthlyRentKrw': 9_000_000},
        {'floor': '5F', 'pyeong': 60.00, 'perPyeongKrw': 180_000, 'monthlyRentKrw': 10_800_000},
        {'floor': '4F', 'pyeong': 94.67, 'perPyeongKrw': 180_000, 'monthlyRentKrw': 17_040_600},
        {'floor': '3F', 'pyeong': 94.67, 'perPyeongKrw': 180_000, 'monthlyRentKrw': 17_040_600},
        {'floor': '2F', 'pyeong': 94.67, 'perPyeongKrw': 200_000, 'monthlyRentKrw': 18_894_000},
        {'floor': '1F', 'pyeong': 70.00, 'perPyeongKrw': 220_000, 'monthlyRentKrw': 15_400_000},
        {'floor': 'B1', 'pyeong': 150.00, 'perPyeongKrw': 60_000, 'monthlyRentKrw': 9_000_000},
    ],
    'regulation': {
        'name': '서울시 소규모 건축물 용적률 완화',
        'startsAt': '2025-05-19', 'expiresAt': '2028-05-18',
        'relaxedFarPct': 250, 'baseFarPct': 200,
    },
    'expect': {
        'stackingRowMismatch': [{'floor': '2F', 'stated': 18_894_000, 'computed': 18_934_000, 'diff': -40_000}],
        'sumMonthlyRentKrw': 97_175_200,
        'sumMonthlyRentCorrectedKrw': 97_215_200,
        'annualRentKrw': 1_166_102_400,
        'subtotalCostKrw': 32_095 * M,
        'acquisitionTaxKrw': 1_114_442_000,
        'totalCostKrw': 33_209_442_000,
        'postDevYield': {'gross_price_subtotal': 3.63, 'gross_price_total': 3.51,
                         'gross_price_deposit': 3.77},
        'farRelaxed': {'legacyDefaultPct': 400, 'actualPct': 250, 'overstatePct': 60},
        'targetFarNull_blocksDevScale': True,
        'minResolution': 'R1',
        'archetype': 'A17',
    },
}

# ── 4. 수택동 (development · 매수인 명도 · R3 필요) ───────────────────────
SUTAEK = {
    'fixtureId': 'sutaek',
    'maskNote': '나대지 · 명도 개념 없음',
    'asset': {
        'assetId': 'FX-ST-001',
        'addressBand': '경기도 구리시 수택동',
        'assetType': 'land',
        'totalFloorAreaSqm': None,
    },
    'posture': 'development',
    'devMode': 'sale',
    'vacateResponsibility': 'buyer',
    'financial': {'targetFarPct': None},
    'ledger': {'asOf': None, 'rows': []},
    'expect': {
        'ledgerRows': 0,
        'resolution': 'R0',
        'minResolutionRequired': 'R3',
        'feasibilitySectionHidden': True,    # ★ 매수인 명도 + R3 미달
        'deficiencyFields': ['targetFarByZoning'],
    },
}

# ── 5. 호텔 (operating · O2 · GOP 보류) ──────────────────────────────────
HOTEL = {
    'fixtureId': 'hotel',
    'maskNote': '운영사명 제외',
    'asset': {'assetId': 'FX-HT-001', 'addressBand': '서울특별시', 'assetType': 'hotel'},
    'posture': 'operating',
    'financial': {'gopMarginPct': None, 'opexKrw': None},
    'market': {'seoulRevPar2025Krw': 207_345, 'note': '4~5성급 포함 평균 — 등급 보정 없음'},
    'expect': {
        'verificationLevel': 'unverified',
        'gop': None,
        'gopPriceRendered': False,           # ★ Opex/GOP 충돌 확인 전까지 보류
        'blockedReason': 'gopMarginPct 미입력',
    },
}

ALL = [YANGPYEONG, DANGSAN, JAMWON, SUTAEK, HOTEL]

if __name__ == '__main__':
    index = []
    for fx in ALL:
        path = os.path.join(OUT, f"{fx['fixtureId']}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(fx, f, ensure_ascii=False, indent=2)
        index.append({'fixtureId': fx['fixtureId'], 'posture': fx['posture'],
                      'file': f"{fx['fixtureId']}.json"})
        print(f"  {fx['fixtureId']:12s} {fx['posture']:15s} -> {path}")
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\n픽스처 {len(ALL)}건 생성 완료")
