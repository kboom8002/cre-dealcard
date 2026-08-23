#!/usr/bin/env python3
"""골든 원천 데이터 8건 — 조사 결과 추출·검산 (D16 §3)

출처 3등급
  S : 진본 IM (중개인 작성) + 실측 렌트롤   → 양평·당산·잠원
  A : 실매물 공개자료 정박 저작              → dbritz.kr 5건
  C : 순수 합성 (폐기)                       → 기존 164건

원칙
  1. 기사 문장을 옮기지 않는다. **사실만** 추출한다.
  2. 없는 값은 null. 추정하지 않는다.
  3. 모든 파생값은 검산한다 (평↔㎡, 평당가, 배수).
  4. source_url·harvested_at을 남긴다.
"""
import json, os, sys
from datetime import date

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'golden_source')
os.makedirs(OUT, exist_ok=True)

PY = 3.305785          # ㎡ → 평 나눗수
EOK = 100_000_000
HARVEST = '2026-08-23'
BASE = 'https://dbritz.kr/gangnam-building-sale/?bmode=view&idx='

fails = []


def chk(label, a, b, tol=0.0):
    if a is None or b is None:
        return
    ok = abs(a - b) <= tol
    if not ok:
        fails.append(f'{label}: {a:,.4f} != {b:,.4f}')
    print(f'   {"OK " if ok else "!! "}{label:32s} {a:>16,.2f}')


# ══════════════════════════════════════════════════════════════════
# A등급 — dbritz.kr 실매물 5건
# ══════════════════════════════════════════════════════════════════

G03 = {  # owner_occupied #1
    'goldenId': 'G03-yeoksam-hq-120', 'grade': 'A', 'posture': 'owner_occupied',
    'source': {'url': BASE + '172861167', 'harvestedAt': HARVEST,
               'publisher': 'DBRITZ', 'kind': '공개 매물 기사'},
    'addressBand': '서울특별시 강남구 역삼동',
    'facts': {
        'priceKrw': 120 * EOK,
        'landSqm': 284.8, 'landPyeong': 86.15,
        'grossFloorSqm': 785.9, 'grossFloorPyeong': 237.72,
        'floors': '지하 1층 ~ 지상 6층', 'completedYear': 2023,
        'zoning': '제2종일반주거지역',
        'bcrPct': 57.51, 'farPct': 199.75,
        'parking': '자주식 6대', 'elevator': 1, 'restrooms': 9,
        'transit': '역삼역 도보 5~6분',
        'landPerPyeongKrw': 139_290_000, 'gfaPerPyeongKrw': 50_480_000,
        'priorDeal': {'date': '2021-03', 'priceKrw': int(57.8 * EOK),
                      'perPyeongKrw': 67_000_000, 'note': '토지 거래 후 신축'},
        'officialLandPricePerPyeongKrw': 31_720_000,
        'violationBuilding': False,
        'roadCondition': '세로', 'orientation': '동향', 'hvac': '개별',
    },
    'deficiencies': ['임대차 계약 조건(보증금·월세·만기)', '지상층 인도 조건', '층별 전용면적'],
    'teachingPoint': '신축 vs 완성건물 매입 비교 · 명도 시점이 핵심 협의사항',
}

G04 = {  # owner_occupied #2
    'goldenId': 'G04-yeoksam-office-50', 'grade': 'A', 'posture': 'owner_occupied',
    'source': {'url': BASE + '172569313', 'harvestedAt': HARVEST,
               'publisher': 'DBRITZ', 'kind': '공개 매물 기사'},
    'addressBand': '서울특별시 강남구 역삼동',
    'facts': {
        'priceKrw': 50 * EOK,
        'landSqm': None, 'landPyeong': 78.59,
        'grossFloorSqm': None, 'grossFloorPyeong': 105.86,
        'floors': '지하 1층 ~ 지상 2층', 'buildingAgeYears': 33,
        'zoning': '제3종일반주거지역',
        'bcrPct': None, 'farPct': None,          # ★ 자료 미제공
        'transit': '언주역 인근', 'roadCondition': '소로한면',
        'elevator': 0,
        'landPerPyeongKrw': 63_620_000,
        'priorDeal': {'date': '2026-04-29', 'priceKrw': int(41.5 * EOK)},
        'priorDeal2': {'date': '2022-04', 'priceKrw': 45 * EOK},
        'remodeled': '있음 (시점·범위 미확인)',
        'leaseState': '임대중 (보증금·월세·계약기간 미공개)',
    },
    'deficiencies': ['건폐율·용적률', '보증금·월세·계약기간', '리모델링 공사 범위·시점',
                     '3개월 만의 +20.5% 가격 상승 근거'],
    'teachingPoint': '단기 재매각 호가 검증 · 용적률 자료 없으면 신축 사업성 단정 금지',
}

G05 = {  # development #1
    'goldenId': 'G05-samseong-house-195', 'grade': 'A', 'posture': 'development',
    'source': {'url': BASE + '172860444', 'harvestedAt': HARVEST,
               'publisher': 'DBRITZ', 'kind': '공개 매물 기사'},
    'addressBand': '서울특별시 강남구 삼성동',
    'facts': {
        'priceKrw': 195 * EOK,
        'landSqm': 497.2, 'landPyeong': 150.4,
        'grossFloorSqm': 317.4, 'grossFloorPyeong': 96.02,
        'floors': '지하 1층 ~ 지상 2층', 'buildingAgeYears': 41.5,
        'zoning': '제1종전용주거지역',                # ★ 개발 밀도 최저
        'bcrPct': None, 'farPct': None,
        'transit': '청담역 6번 출구 390m · 도보 6분',
        'roadCondition': '6m·4m 양면도로 세각지',
        'orientation': '남향', 'elevator': 0, 'violationBuilding': False,
        'landPerPyeongKrw': 129_650_000, 'gfaPerPyeongKrw': 203_090_000,
        'officialLandPricePerPyeongKrw': 42_310_000,
    },
    'deficiencies': ['임대차 현황', '대출 현황', '허용 용도(비주거 전환 가능성)',
                     '높이 제한·일조·지구단위계획'],
    'teachingPoint': '제1종전용주거지역 — 용적률 400% 일괄 적용 시 최대 4배 과대',
}

G07 = {  # trading #1
    'goldenId': 'G07-daechi-150', 'grade': 'A', 'posture': 'trading',
    'source': {'url': BASE + '173180120', 'harvestedAt': HARVEST,
               'publisher': 'DBRITZ', 'kind': '공개 매물 기사'},
    'addressBand': '서울특별시 강남구 대치동',
    'facts': {
        'priceKrw': 150 * EOK,
        'landSqm': 247.8, 'landPyeong': 74.96,
        'grossFloorSqm': 777.3, 'grossFloorPyeong': 235.14,
        'buildingAgeYears': 30.5,
        'zoning': '제2종일반주거지역',
        'roadCondition': '소로한면', 'orientation': '남서향', 'parking': '자주식 4대',
        'landPerPyeongKrw': 200_100_000, 'gfaPerPyeongKrw': 63_790_000,
        'officialLandPricePerPyeongKrw': 35_800_000,
        'dealHistory': [
            {'date': '2008-10', 'priceKrw': int(24.3 * EOK)},
            {'date': '2016-05', 'priceKrw': 31 * EOK},
            {'date': '2024-04-15', 'priceKrw': int(82.5 * EOK), 'perPyeongKrw': 110_000_000},
        ],
        'remodeled': '대수선·리모델링 이력 있음',
    },
    'deficiencies': ['임대현황', '기대출 승계 여부', '보증금·월 임대수익', '리모델링 범위'],
    'teachingPoint': '2024년 실거래 82.5억 → 호가 150억(+81.8%) · comps 없이 출구가 산출 금지',
}

G08 = {  # trading #2
    'goldenId': 'G08-yeoksam-98', 'grade': 'A', 'posture': 'trading',
    'source': {'url': BASE + '173119584', 'harvestedAt': HARVEST,
               'publisher': 'DBRITZ', 'kind': '공개 매물 기사'},
    'addressBand': '서울특별시 강남구 역삼동',
    'facts': {
        'priceKrw': 98 * EOK,
        'landSqm': 297.2, 'landPyeong': 89.9,
        'grossFloorSqm': 490.4, 'grossFloorPyeong': 148.34,
        'floors': '지하 1층 ~ 지상 3층',
        'zoning': '제1종일반주거지역',
        'transit': '언주역 5번 출구 310m · 도보 5분',
        'roadCondition': '약 6m 도로 · 삼거리 인근',
        'orientation': '동향', 'elevator': 0,
        'landPerPyeongKrw': 109_000_000,
        'officialLandPricePerPyeongKrw': 32_970_000,
        'dealHistory': [
            {'date': '2023-02', 'priceKrw': int(76.7 * EOK), 'perPyeongKrw': 85_000_000},
        ],
        'priceGapVsLastDealPct': 27.8,
    },
    'deficiencies': ['임대현황', '대출 현황', '건폐율·용적률', '2021년 거래가'],
    'teachingPoint': '호가 98억 = 2023년 실거래 +21.3억 · 상승 근거 검증 필요',
}

ARTICLES = [G03, G04, G05, G07, G08]

# ══════════════════════════════════════════════════════════════════
# S등급 — 진본 IM 3건 (기존 픽스처 참조)
# ══════════════════════════════════════════════════════════════════

NATIVE = [
    {'goldenId': 'G01-yangpyeong-250', 'grade': 'S', 'posture': 'income',
     'fixture': 'yangpyeong', 'ledgerRows': 12, 'hasRentRoll': True,
     'teachingPoint': '표지·원장 불일치 질의 · 첨부 공부 소재지 불일치 · LTV 50% 역레버리지'},
    {'goldenId': 'G02-dangsan-115', 'grade': 'S', 'posture': 'income',
     'fixture': 'dangsan', 'ledgerRows': 8, 'hasRentRoll': True,
     'teachingPoint': '통합계약 표기 · 자가사용은 공실 아님 · 면적 자기모순 질의'},
    {'goldenId': 'G06-jamwon-dev', 'grade': 'S', 'posture': 'development',
     'fixture': 'jamwon', 'ledgerRows': 0, 'hasRentRoll': False,
     'teachingPoint': '투입비 3단 + 취득세 · 개발 후 수익률 · 한시 규제 잔여일'},
]


def verify():
    print('=' * 62)
    print('A등급 5건 검산')
    print('=' * 62)
    for g in ARTICLES:
        f = g['facts']
        print(f"\n[{g['goldenId']}]  {g['posture']}")
        if f.get('landSqm') and f.get('landPyeong'):
            chk('대지 ㎡→평', f['landSqm'] / PY, f['landPyeong'], 0.02)
        if f.get('grossFloorSqm') and f.get('grossFloorPyeong'):
            chk('연면적 ㎡→평', f['grossFloorSqm'] / PY, f['grossFloorPyeong'], 0.02)
        if f.get('landPerPyeongKrw'):
            chk('토지 평당가', f['priceKrw'] / f['landPyeong'],
                f['landPerPyeongKrw'], 60_000)
        if f.get('gfaPerPyeongKrw'):
            chk('연면적 평당가', f['priceKrw'] / f['grossFloorPyeong'],
                f['gfaPerPyeongKrw'], 60_000)
        if f.get('farPct') and f.get('landSqm'):
            above = f['landSqm'] * f['farPct'] / 100
            print(f'      · 지상 연면적(용적률 역산) {above:,.1f}㎡ '
                  f'→ 지하 추정 {f["grossFloorSqm"] - above:,.1f}㎡')
        if f.get('officialLandPricePerPyeongKrw'):
            tot = f['officialLandPricePerPyeongKrw'] * f['landPyeong']
            print(f'      · 공시지가 총액 {tot / EOK:,.2f}억 · '
                  f'매매가/공시지가 {f["priceKrw"] / tot:,.2f}배')
        if f.get('priceGapVsLastDealPct'):
            last = f['dealHistory'][-1]['priceKrw']
            chk('직전 대비 상승률', (f['priceKrw'] / last - 1) * 100,
                f['priceGapVsLastDealPct'], 0.05)
        if f.get('priorDeal') and g['goldenId'].startswith('G04'):
            d = f['priorDeal']['priceKrw']
            print(f'      · 3개월 상승 {(f["priceKrw"] - d) / EOK:,.1f}억 '
                  f'({(f["priceKrw"] / d - 1) * 100:,.1f}%)')

    print('\n' + '=' * 62)
    print('용적률 400% 일괄 적용 오차 (D4 §2.1 실증 확장)')
    print('=' * 62)
    zon = {'제1종전용주거지역': 100, '제1종일반주거지역': 150,
           '제2종일반주거지역': 250, '제3종일반주거지역': 300}
    for g in ARTICLES:
        z = g['facts']['zoning']
        if z in zon:
            print(f"   {g['goldenId']:26s} {z:12s} 상한 {zon[z]:>3d}%  "
                  f"→ 400% 적용 시 {400 / zon[z]:.2f}배 과대")


if __name__ == '__main__':
    verify()
    for g in ARTICLES:
        with open(os.path.join(OUT, g['goldenId'] + '.json'), 'w', encoding='utf-8') as fp:
            json.dump(g, fp, ensure_ascii=False, indent=2)
    idx = [{'goldenId': g['goldenId'], 'grade': g['grade'], 'posture': g['posture'],
            'source': g['source']['url']} for g in ARTICLES]
    idx += [{'goldenId': n['goldenId'], 'grade': n['grade'], 'posture': n['posture'],
             'source': f"fixtures/{n['fixture']}.json"} for n in NATIVE]
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fp:
        json.dump(idx, fp, ensure_ascii=False, indent=2)

    print('\n' + '=' * 62)
    print(f'A등급 {len(ARTICLES)}건 + S등급 {len(NATIVE)}건 = {len(idx)}건')
    if fails:
        print(f'검산 불일치 {len(fails)}건')
        for x in fails:
            print('  -', x)
        sys.exit(1)
    print('검산 통과')
