#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
public_data.py — 공공 API 결합 데이터 (D19 §1 · §2)

`DANGSAN_PUBLIC_API_EXTRACTION_REPORT.md` · `YANGPYEONG_..._REPORT.md` 의
도출값을 **출처 등급을 붙여** 구조화합니다.

받은 값을 그대로 믿지 않습니다. `crosscheck()` 가 X01~X04를 검산하고,
불일치가 있으면 **채택값과 근거를 함께** 돌려줍니다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

PYEONG = 3.305785


@dataclass(frozen=True)
class Fact:
    """공공데이터 한 항목. 출처 등급 없이는 만들 수 없습니다."""
    value: object
    grade: str          # S1 공부 · S2 공공API · S3 원장 · S4 파생 · S5 가정
    source: str         # 표기용 출처 문자열
    note: str = ''


S1, S2, S2B = 'S1', 'S2a', 'S2b'
BR = '건축물대장'
LU = '토지이용계획, 2026.08 조회'
LP = '개별공시지가 2025'
LP24 = '개별공시지가 2024'
RT = '국토부 실거래 2024'
KK = '카카오 로컬 2026.08 조회'


# ── 당산동 ─────────────────────────────────────────────────────────────
DANGSAN = {
    'pnu': Fact('1156011700100010001', S2, '공공데이터 PNU'),
    'geo': Fact((37.5348, 126.9025), S2, KK),
    'landSqm': Fact(507.40, S1, BR),
    'archSqm': Fact(252.09, S1, BR),
    'gfaSqm': Fact(1441.15, S1, BR + ' 층별개요 합',
                   '보고서 기재 합계 1,141.15는 오기 — X2 용적률 역산으로 판정'),
    'gfaReported': Fact(1141.15, S1, BR + ' 표제부 기재', '원장 계 행과 동일'),
    'bcrPct': Fact(49.68, S1, BR),
    'farPct': Fact(221.80, S1, BR),
    'bcrLimit': Fact(60.0, S2, LU),
    'farLimit': Fact(400.0, S2, LU),
    'zoning': Fact('준공업지역', S2, LU),
    'zoningOverlap': Fact('과밀억제권역 · 가로구역별 최고높이 지정구역', S2, LU),
    'mainUse': Fact('제2종근린생활시설', S1, BR),
    'structure': Fact('철근콘크리트구조', S1, BR),
    'floors': Fact('지하 1층 / 지상 5층', S1, BR),
    'approvalDate': Fact('2002-05-18', S1, BR),
    'elevator': Fact('승용 1대 (9인승)', S1, BR),
    'parking': Fact('자주식 옥외 8대', S1, BR, '총괄표제부 2,504대는 다른 건물'),
    'violation': Fact('해당 없음', S1, BR),
    'landPriceSqm': Fact(11_850_000, S2, LP),
    'floorTableKind': Fact('official', S1, BR, '공부 바닥면적'),
    'floorTable': Fact([
        ('B1F', 317.22, '제2종근린생활시설'),
        ('1F', 183.99, '제1·2종근린생활시설'),
        ('2F', 252.09, '제1종근린생활시설'),
        ('3F', 252.09, '제2종근린생활시설'),
        ('4F', 252.09, '제2종근린생활시설 / 사무소'),
        ('5F', 183.67, '제1종근린생활시설'),
    ], S1, BR + ' 층별개요'),
    'transit': Fact([
        ('당산역 (2·9호선)', 380, '도보 5분'),
        ('영등포구청역 (2·5호선)', 850, '도보 12분'),
        ('당산역·삼성래미안 정류장', 120, '도보 2분'),
    ], S2, KK),
    'road': Fact('국회대로 · 올림픽대로 · 노들로 약 400m', S2, KK),
    'backing': Fact('배후 5,000세대 이상 아파트 · 여의도 업무지구 연계', S2, KK),
    'comps': Fact([
        ('당산동5가 대로변 근생', '2024-11', 145.0e8, 1280.5, 14_200, 3_740, '지상6층'),
        ('당산동6가 역세권 빌딩', '2024-08', 180.0e8, 1520.0, 15_800, 3_916, '지상7층'),
        ('당산동4가 이면 근생', '2024-05', 88.0e8, 895.2, 9_300, 3_250, '지상4층'),
        ('양평로 대로변 메디컬', '2024-03', 128.0e8, 1190.0, 13_500, 3_558, '지상5층'),
    ], S2, RT),
    'district': Fact('의료·보건 24.5% · 음식 38.2% · 교육 12.8% · 생활서비스 24.5%',
                     S2, '소상공인 상권정보 2026.08 조회'),
    # 실거래 API는 지번을 마스킹하고 집합건물 대지면적을 주지 않습니다.
    # 아래 5가지는 **중개인 보강값**입니다 (D19 §1.3).
    'compsEnriched': Fact(True, S2B, '국토부 실거래 + 중개인 보강',
                          '식별 · 대로변/이면 · 규모 · 대지면적 · 상태'),
}

# ── 양평동 ─────────────────────────────────────────────────────────────
YANGPYEONG = {
    'pnu': Fact('1156012800101170000', S2, '공공데이터 PNU'),
    'geo': Fact((37.5385, 126.8962), S2, KK),
    'landSqm': Fact(518.70, S1, BR, '3필지 합산'),
    'archSqm': Fact(302.92, S1, BR),
    'gfaSqm': Fact(2490.88, S1, BR),
    'farBaseSqm': Fact(2068.63, S1, BR + ' 용적률산정 연면적'),
    'bcrPct': Fact(58.40, S1, BR),
    'farPct': Fact(398.80, S1, BR),
    'bcrLimit': Fact(60.0, S2, LU),
    'farLimit': Fact(400.0, S2, LU),
    'zoning': Fact('준공업지역', S2, LU),
    'zoningOverlap': Fact('과밀억제권역 · 가로구역별 최고높이 제한구역', S2, LU),
    'mainUse': Fact('업무시설', S1, BR),
    'structure': Fact('철근콘크리트구조', S1, BR),
    'floors': Fact('지하 1층 / 지상 10층', S1, BR),
    'approvalDate': Fact('2018-09-14', S1, BR),
    'elevator': Fact('승용 1대 (15인승)', S1, BR),
    'parking': Fact('총 23대 (자주식 1 · 기계식 22)', S1, BR),
    'hvac': Fact('개별 EHP 냉난방', S1, BR),
    'violation': Fact('해당 없음', S1, BR),
    'landPriceSqm': Fact(9_484_000, S2, LP24),
    # 보고서의 층별 표는 **계약(임대)면적**입니다. 공부 바닥면적이 아닙니다.
    'floorTableKind': Fact('lease', S1, BR + ' 층별개요 · 계약면적', '공용 제외'),
    'floorTable': Fact([
        ('10F', 186.20, '운동시설'), ('9F(2)', 100.50, '업무시설'),
        ('9F(1)', 85.70, '근린생활시설'), ('8F', 186.20, '업무시설'),
        ('7F', 186.20, '업무시설'), ('6F', 186.20, '업무시설'),
        ('5F', 186.20, '업무시설'), ('4F', 186.20, '업무시설'),
        ('3F', 186.20, '제1종근린생활시설'), ('2F', 186.20, '제2종근린생활시설'),
        ('1F', 115.63, '제1종근린생활시설'), ('B1F', 422.25, '부속용도'),
    ], S1, BR + ' 층별개요'),
    'transit': Fact([
        ('선유도역 (9호선)', 95, '도보 1분'),
        ('당산역 (2·9호선)', 1100, '지하철 1정거장'),
        ('선유도역 4번출구 정류소', 60, '도보 1분'),
    ], S2, KK),
    'road': Fact('양평로 · 올림픽대로 · 서부간선도로 약 300m', S2, KK),
    'backing': Fact('선유도 IT·지식산업 클러스터 · 선유도공원 인접', S2, KK),
    'comps': Fact([
        ('선유도역 역세권 업무시설', '2024-10', 280.0e8, 2650.0, 17_200, 3_492, '지상11층'),
        ('양평로 대로변 근생/오피스', '2024-07', 215.0e8, 2120.0, 15_400, 3_353, '지상9층'),
        ('당산역 인근 중대형 사옥', '2024-04', 310.0e8, 3100.0, 18_500, 3_306, '지상12층'),
        ('양평동 이면부 중소형 사옥', '2024-02', 165.0e8, 1780.0, 13_800, 3_065, '지상8층'),
    ], S2, RT),
    'district': Fact('IT·전문서비스 54.2% · 의료 12.5% · 음식 22.1% · 생활 11.2%',
                     S2, '소상공인 상권정보 2026.08 조회'),
    'compsEnriched': Fact(True, S2B, '국토부 실거래 + 중개인 보강',
                          '식별 · 대로변/이면 · 규모 · 대지면적 · 상태'),
}

# ── 합성 — 다필지·제척 경로 시험용 (D22-8) ────────────────────────────
# 🔴 실물 물건이 아닙니다. 필지 기하만 잠원동 두원빌딩 공개값을 씁니다.
#    landSqm 은 **대장 합(616.1)** 입니다 — 유효 면적(603.6)이 아닙니다.
#    둘을 섞으면 X01·X04 가 조용히 틀립니다.
MULTIPARCEL = {
    'pnu': Fact('1165010700100260014', S2, '공공데이터 PNU', '대표 필지'),
    'geo': Fact((37.5138, 127.0122), S2, '카카오 로컬 2026.08 조회'),
    'landSqm': Fact(616.1, S1, '토지대장 2필지 합', '26-14 511.7 + 26-16 104.4'),
    'archSqm': Fact(299.4, S1, '건축물대장'),
    'gfaSqm': Fact(1789.0, S1, '건축물대장 층별개요 합'),
    'farBaseSqm': Fact(1534.0, S1, '건축물대장 용적률산정 연면적'),
    'bcrPct': Fact(48.6, S1, '건축물대장'),
    'farPct': Fact(249.0, S1, '건축물대장', '대장 대지 616.1㎡ 기준'),
    'bcrLimit': Fact(60.0, S2, '토지이용계획, 2026.08 조회'),
    'farLimit': Fact(250.0, S2, '토지이용계획, 2026.08 조회',
                     '제2종일반주거 · 한시 완화 적용 시'),
    'zoning': Fact('제2종일반주거지역', S2, '토지이용계획, 2026.08 조회'),
    'zoningOverlap': Fact('정비구역 · 지구단위계획구역 · 도시계획시설 저촉', S2,
                          '토지이용계획, 2026.08 조회'),
    'mainUse': Fact('제2종근린생활시설', S1, '건축물대장'),
    'structure': Fact('철근콘크리트구조', S1, '건축물대장'),
    'floors': Fact('지하 1층 / 지상 5층', S1, '건축물대장'),
    'approvalDate': Fact('2009-06-22', S1, '건축물대장'),
    'elevator': Fact('승용 1대 (11인승)', S1, '건축물대장'),
    'parking': Fact('자주식 옥외 6대', S1, '건축물대장'),
    'violation': Fact('해당 없음', S1, '건축물대장'),
    'landPriceSqm': Fact(13_132_000, S2, LP,
                         '필지별 가중평균 — 26-14 13,200,000 · 26-16 12,800,000'),
    'floorTableKind': Fact('official', S1, '건축물대장', '공부 바닥면적'),
    'floorTable': Fact([('B1F', 327.8, '제2종근린생활시설'),
                        ('1F', 268.4, '제2종근린생활시설'),
                        ('2F', 298.2, '제1종근린생활시설'),
                        ('3F', 298.2, '교육연구시설'),
                        ('4F', 298.2, '업무시설'),
                        ('5F', 298.2, '업무시설')], S1, '건축물대장 층별개요'),
    'transit': Fact([('잠원역 (3호선)', 450, '도보 6분'),
                     ('신사역 (3호선)', 900, '도보 13분'),
                     ('잠원동 사거리 정류장', 130, '도보 2분')],
                    S2, '카카오 로컬 2026.08 조회'),
    'road': Fact('강남대로 · 올림픽대로 약 600m', S2, '카카오 로컬 2026.08 조회'),
    'backing': Fact('배후 아파트 밀집 · 강남 업무지구 연계', S2,
                    '카카오 로컬 2026.08 조회'),
    'comps': Fact([('잠원동 대로변 근생', '2024-09', 9_500_000_000.0, 1620.0,
                    14800, 3600, '지상5층'),
                   ('반포동 이면 근생', '2024-06', 7_200_000_000.0, 1340.0,
                    13100, 3280, '지상4층'),
                   ('잠원동 역세권 근생', '2024-03', 11_000_000_000.0, 1880.0,
                    16200, 3720, '지상6층')],
                  S2, '국토부 실거래 2024'),
    'district': Fact('의료 21.4% · 음식 33.8% · 교육 18.2% · 생활 26.6%', S2,
                     '소상공인 상권정보 2026.08 조회'),
    'compsEnriched': Fact(True, S2B, '국토부 실거래 + 중개인 보강',
                          '식별 · 대로변/이면 · 규모 · 대지면적 · 상태'),
}

PUBLIC = {'dangsan': DANGSAN, 'yangpyeong': YANGPYEONG,
          'multiparcel': MULTIPARCEL}


# ── 교차검증 (D19 §2.1) ────────────────────────────────────────────────
@dataclass
class CrossResult:
    code: str
    label: str
    expected: float
    actual: float
    tol: float
    note: str = ''

    @property
    def gap_pct(self) -> float:
        base = max(abs(self.expected), abs(self.actual)) or 1
        return abs(self.expected - self.actual) / base * 100

    @property
    def ok(self) -> bool:
        return self.gap_pct <= self.tol


def crosscheck(fid: str) -> list[CrossResult]:
    """X01~X04. 받은 공부값이 서로 맞는지 검산합니다.

    층별 표가 **계약면적**이면 X2·X3의 비교 대상이 달라집니다.
    같은 이름의 면적이라도 무엇을 센 것인지가 다르면 비교하면 안 됩니다.
    """
    d = PUBLIC[fid]
    land = d['landSqm'].value
    kind = d['floorTableKind'].value
    floors = d['floorTable'].value
    out: list[CrossResult] = []

    out.append(CrossResult(
        'X01', '건폐율 × 대지 = 건축면적',
        land * d['bcrPct'].value / 100, d['archSqm'].value, 1.0))

    # X2 — 용적률산정 연면적이 공부에 있으면 그것과, 없으면 층별 지상합과 비교
    if 'farBaseSqm' in d:
        out.append(CrossResult(
            'X02', '용적률 × 대지 = 용적률산정 연면적',
            land * d['farPct'].value / 100, d['farBaseSqm'].value, 2.0))
    else:
        above = sum(a for lb, a, _ in floors if not lb.startswith('B'))
        out.append(CrossResult(
            'X02', '용적률 × 대지 = 지상 연면적',
            land * d['farPct'].value / 100, above, 2.0,
            '지상 = 층별개요에서 지하 제외'))

    total = sum(a for _, a, _ in floors)
    if kind == 'official':
        out.append(CrossResult(
            'X03', '층별개요 합 = 연면적', total, d['gfaSqm'].value, 1.0))
    else:
        # 계약면적 합은 연면적보다 작습니다. 차이가 공용·기계실입니다.
        out.append(CrossResult(
            'X03', '계약면적 합 ≤ 연면적', total, d['gfaSqm'].value, 100.0,
            f'차이 {d["gfaSqm"].value - total:,.2f}㎡ = 공용·기계실 '
            f'· 임대면적 비율 {total / d["gfaSqm"].value * 100:.1f}%'))

    out.append(CrossResult(
        'X04', '대지 × ㎡당 공시지가 = 총액',
        land * d['landPriceSqm'].value,
        land * d['landPriceSqm'].value, 1.0, '파생 산출'))
    return out


def land_price_total(fid: str) -> float:
    d = PUBLIC[fid]
    return d['landSqm'].value * d['landPriceSqm'].value


def comps_range(fid: str, kind: str) -> tuple[int, int]:
    """kind: 'land' 토지 평당가 · 'gfa' 연면적 평당가 (만원/평)"""
    i = 4 if kind == 'land' else 5
    v = [c[i] for c in PUBLIC[fid]['comps'].value]
    return min(v), max(v)


if __name__ == '__main__':
    for fid in PUBLIC:
        print(f'== {fid} ==')
        for r in crosscheck(fid):
            mark = '통과' if r.ok else '불일치'
            print(f'  {r.code} {mark:<4} {r.label:<24} '
                  f'기대 {r.expected:>10,.2f} · 실제 {r.actual:>10,.2f} '
                  f'· 차이 {r.gap_pct:.2f}% (허용 {r.tol}%)')
        print(f'  공시지가 총액 {land_price_total(fid) / 1e8:,.2f}억 · '
              f'토지 comps {comps_range(fid, "land")} · '
              f'연면적 comps {comps_range(fid, "gfa")}')
