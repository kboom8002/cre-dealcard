#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
input_spec.py — 중개인 입력 표준(바텀시트) 사전 + 블록 게이팅 판정기
                (D19 v2.0 §7·§8 · 부록 A·B)

**IM은 자료의 함수입니다.** 무엇이 들어왔는지에 따라 어떤 블록이 열리는지가
결정론적으로 정해져야 합니다. 사람이 매번 판단하면 물건마다 달라집니다.

축 두 개
  L축  임대차 해상도  R0~R3   (렌트롤 표준양식 · IM_RESOLUTION_TIERS 정본)
  P축  물건자료 해상도 P0~P3   (공부·공공 API·중개인 보강 — D19 신설)

출력
  · 필드 사전 40종 — 필수/권장/선택 · 자료형 · 검증 · 여는 블록
  · 블록 32종 — 필요 입력 · 잠김 사유
  · 시나리오별 실측 판정
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Callable

# ── 등급 ───────────────────────────────────────────────────────────────
REQ, REC, OPT = '필수', '권장', '선택'

# 출처 등급 (D19 §1 · v2.0에서 S2 분할)
S1 = 'S1'    # 공부 — 건축물대장·토지대장·등기부
S2A = 'S2a'  # 공공 API 원시 — 그대로 쓸 수 있는 값
S2B = 'S2b'  # 공공 API + 중개인 보강 — 보강 없이는 쓸 수 없는 값
S3 = 'S3'    # 중개인 원장·입력
S5 = 'S5'    # 가정


@dataclass(frozen=True)
class Field:
    key: str
    group: str
    label: str
    tier: str                    # 필수 / 권장 / 선택
    grade: str                   # 출처 등급
    dtype: str
    opens: tuple[str, ...] = ()  # 이 값이 여는 블록
    axis: str = ''               # 'L1'~'L3' · 'P1'~'P3' · '' (축 무관)
    note: str = ''


# ── 필드 사전 (부록 A) ─────────────────────────────────────────────────
FIELDS: list[Field] = [
    # 1. 물건 식별 ─────────────────────────────────────────────────────
    Field('address_jibun', '물건 식별', '소재지 지번', REQ, S3, 'string',
          ('public_lookup',), 'P1',
          '공공 API 조회 키. 없으면 P축 전체가 열리지 않습니다'),
    Field('price_krw', '물건 식별', '매매 희망가', REQ, S3, 'int',
          ('hero', 'acq_cost', 'ltv', 'yield', 'unit_price'), '',
          '없으면 IM을 만들지 않습니다'),
    Field('asset_alias', '물건 식별', '자산 별칭', REC, S3, 'string',
          ('cover_title',), '', '근생빌딩 · 오피스빌딩 등'),
    Field('ownership_type', '물건 식별', '소유 형태', REC, S3, 'enum',
          ('risk_ownership', 'terms'), '', '단독 / 층별 구분등기 / 공유'),
    Field('owner_count', '물건 식별', '소유자 수', REC, S3, 'int',
          ('risk_ownership',), '', '2인 이상이면 매각 동의가 선결 조건'),

    # 2. 임대차 원장 (렌트롤 표준양식) ──────────────────────────────────
    Field('rr_as_of', '임대차 원장', '임대 현황 기준일', REQ, S3, 'date',
          ('lease_table', 'expiry_state'), 'L1',
          '없으면 만기 신선도를 판정할 수 없습니다 (게이트 G18)'),
    Field('rr_unit', '임대차 원장', '호실 / 층', REQ, S3, 'string',
          ('lease_table',), 'L1'),
    Field('rr_business', '임대차 원장', '업종', REQ, S3, 'string',
          ('lease_table', 'tenant_mix'), 'L1', '원문 그대로 · 추론 금지'),
    Field('rr_deposit', '임대차 원장', '보증금', REQ, S3, 'int',
          ('lease_sum', 'acq_cost', 'ltv'), 'L1'),
    Field('rr_rent', '임대차 원장', '월세', REQ, S3, 'int',
          ('lease_sum', 'yield', 'ltv', 'hero'), 'L1'),
    Field('rr_expiry', '임대차 원장', '계약 만료일', REQ, S3, 'date',
          ('expiry_state', 'expiry_timeline'), 'L1'),
    Field('rr_state', '임대차 원장', '임대 상태', REQ, S3, 'enum',
          ('vacancy_unit', 'lease_table'), 'L1',
          '임대중 / 공실 / 자가사용 — 자가사용은 공실이 아닙니다'),
    Field('rr_area', '임대차 원장', '임대면적', REC, S3, 'float',
          ('vacancy_area', 'unit_rent', 'floor_logic'), 'L2',
          '공부 층별개요로 대체 가능 (P2 이상)'),
    Field('rr_legal', '임대차 원장', '적용법령', REC, S3, 'enum',
          ('conv_deposit', 'sangim'), 'L2', '상가 / 주택 / 미확인'),
    Field('rr_mgmt', '임대차 원장', '관리비', REC, S3, 'int',
          ('gross_income', 'lease_sum'), 'L2', '공공데이터로 대체 불가'),
    Field('rr_start', '임대차 원장', '현 계약 시작일', REC, S3, 'date',
          ('contract_age',), 'L2', '공공데이터로 대체 불가'),
    Field('rr_first', '임대차 원장', '최초 계약일', OPT, S3, 'date',
          ('renewal_right',), 'L3',
          '갱신요구권 기산점 — 공공데이터로 대체 불가'),
    Field('rr_opposing', '임대차 원장', '대항력 요건', OPT, S3, 'enum',
          ('opposing_power',), 'L3', '사업자등록 여부'),
    Field('rr_group', '임대차 원장', '계약 그룹', OPT, S3, 'string',
          ('combined_lease',), '', '1F+2F 통합계약 표기'),
    Field('rr_vat', '임대차 원장', 'VAT 별도 여부', REC, S3, 'bool',
          ('lease_sum',), '', '기본 별도'),

    # 3. 운영·금융 ─────────────────────────────────────────────────────
    Field('opex_krw', '운영·금융', '연간 운영비', OPT, S3, 'int',
          ('noi', 'net_yield'), '',
          '없으면 "순수익률" 라벨을 쓸 수 없습니다 (불변조건 3)'),
    Field('mgmt_bearer', '운영·금융', '관리비 부담 주체', REC, S3, 'enum',
          ('gross_income',), '', '임차인 / 임대인'),
    Field('loan_balance', '운영·금융', '담보대출 잔액', OPT, S3, 'int',
          ('ltv_actual',), '', '없으면 LTV는 가정치로만'),
    Field('loan_rate', '운영·금융', '대출 금리', OPT, S3, 'float',
          ('ltv_actual',), ''),
    Field('loan_assumable', '운영·금융', '대출 승계 가능', REC, S3, 'enum',
          ('terms',), ''),

    # 4. 비교 사례 보강 — **중개인만 채울 수 있는 영역** ────────────────
    Field('comp_identify', '비교 사례', '비교 물건 식별', OPT, S2B, 'string[]',
          ('comps_table',), 'P3',
          '실거래 API는 지번을 마스킹합니다 (1***). 어느 건물인지는 중개인이 압니다'),
    Field('comp_frontage', '비교 사례', '대로변 / 이면', OPT, S2B, 'enum[]',
          ('comps_table', 'comps_reason'), 'P3',
          '같은 동이라도 대로변과 이면은 평당가가 다릅니다'),
    Field('comp_floors', '비교 사례', '비교 물건 규모', OPT, S2B, 'string[]',
          ('comps_table',), 'P3', 'API의 층 필드는 집합건물만'),
    Field('comp_land_sqm', '비교 사례', '비교 물건 대지면적', OPT, S2B, 'float[]',
          ('comps_land_unit',), 'P3',
          'API 대지면적은 일반건물만 나오고 집합건물은 공란'),
    Field('comp_condition', '비교 사례', '비교 물건 상태', OPT, S2B, 'string[]',
          ('comps_reason',), 'P3', '리모델링·공실·명도 여부'),

    # 5. 개선 여력 ─────────────────────────────────────────────────────
    Field('rent_plan', '개선 여력', '임대료 현실화 계획', OPT, S3, 'table',
          ('rent_uplift',), 'P3',
          '층별 목표 월세 — ◇가정으로 표기하고 근거를 함께 적습니다'),
    Field('vacancy_target', '개선 여력', '공실 목표 임대료', OPT, S3, 'int',
          ('vacancy_uplift',), 'P3', '비교 임대사례를 함께 받습니다'),
    Field('vacancy_comp', '개선 여력', '비교 임대사례', OPT, S3, 'string',
          ('vacancy_uplift',), 'P3'),
    Field('reno_plan', '개선 여력', '리모델링·증축 계획', OPT, S3, 'string',
          ('reno',), 'P3'),

    # 6. 현장·사진 ─────────────────────────────────────────────────────
    Field('photo_ext', '현장·사진', '외부 사진', REC, S3, 'image[]',
          ('cover_photo', 'photo_ext_page', 'overview_photo'), 'P2',
          '3장 이상 권장 · 표지·개요·갤러리에 씁니다'),
    Field('photo_int', '현장·사진', '내부 사진', REC, S3, 'image[]',
          ('photo_int_page',), 'P2', '3장 이상 권장'),
    Field('road_width', '현장·사진', '접면 도로 폭', REC, S3, 'string',
          ('location_road',), 'P2', '공공 API로 대체 불가'),
    Field('corner', '현장·사진', '코너 여부', REC, S3, 'bool',
          ('location_road', 'comps_reason'), 'P2'),
    Field('direction', '현장·사진', '방향', OPT, S3, 'string',
          ('overview_spec',), ''),

    # 7. 거래 조건 ─────────────────────────────────────────────────────
    Field('closing_plan', '거래 조건', '잔금 일정', REC, S3, 'string',
          ('terms',), ''),
    Field('vacate_duty', '거래 조건', '명도 책임', REC, S3, 'enum',
          ('terms', 'risk_vacate'), ''),
    Field('sale_reason', '거래 조건', '매각 사유', OPT, S3, 'string',
          ('terms',), ''),
    Field('broker_view', '거래 조건', '중개인 견해', REC, S3, 'string',
          ('opinion',), '', '"저희가 보기에"로 표기됩니다'),

    # 8. 필지·제척 — **다필지 물건에서만 씁니다** (D22-8) ────────────────
    # 🔴 제척은 API 로 나오지 않습니다. 토지이용계획도의 도시계획시설
    #    저촉선을 읽어야 하고, 관할 구청 확인 전까지 확인사항에 남깁니다.
    Field('parcel_list', '필지·제척', '필지 목록', REC, S1, 'parcel[]',
          ('parcel_table',), 'P2',
          '대표 지번 하나로 인접 필지를 찾아 후보를 제시합니다. 확정은 중개인이'),
    Field('parcel_share', '필지·제척', '공유지분', OPT, S1, 'ratio[]',
          ('parcel_table',), '',
          '공유지분이면 내 몫만 셉니다. 지분 없이 공유로 두면 산출을 거부합니다'),
    Field('exclusion_kind', '필지·제척', '제척 사유', OPT, S3, 'enum[]',
          ('effective_area',), '',
          '계획도로·완충녹지·공원·하천·접도구역·법면·타인지분 7종'),
    Field('exclusion_area', '필지·제척', '제척 면적', OPT, S3, 'float[]',
          ('effective_area', 'effective_far'), '',
          '토지이용계획도 판독값 — ●중개인 · 구청 확인 필요'),
    Field('exclusion_affects_far', '필지·제척', '용적률 산정 제외 여부', OPT, S3,
          'bool[]', ('effective_far',), '',
          '기본값이 있으나 필지마다 다릅니다. 기본값으로 넘기지 않습니다'),

    # 9. 매수 목적 — 토지이용계획 표시를 가릅니다 (L12) ──────────────────
    Field('buyer_purpose', '매수 목적', '매수 목적', REC, S3, 'enum',
          ('zoning_filtered',), '',
          '실사용 / 임대수익 / 가치 상승 여력 / 개발 / 자산배분 — 없으면 전 항목을 같은 비중으로'),
]

FIELD_BY_KEY = {f.key: f for f in FIELDS}

# ── 공공 API가 주는 것 (지번이 있으면 자동) ────────────────────────────
PUBLIC_AUTO = {
    'land_sqm': S1, 'arch_sqm': S1, 'gfa_sqm': S1, 'bcr': S1, 'far': S1,
    'main_use': S1, 'structure': S1, 'floors': S1, 'approval_date': S1,
    'elevator': S1, 'parking': S1, 'violation': S1, 'floor_table': S1,
    'zoning': S2A, 'zoning_overlap': S2A, 'bcr_limit': S2A, 'far_limit': S2A,
    'land_price_sqm': S2A, 'transit': S2A, 'district': S2A,
    'comps_raw': S2A,      # 금액·건물면적·용도지역·건축년도 — 지번은 마스킹
}


# ── 블록 사전 (부록 B) ─────────────────────────────────────────────────
@dataclass(frozen=True)
class Block:
    key: str
    page: str
    label: str
    needs: tuple[str, ...]           # 모두 있어야 열림
    any_of: tuple[tuple[str, ...], ...] = ()   # 각 묶음 중 하나씩
    locked_msg: str = ''


B = Block
BLOCKS: list[Block] = [
    B('cover_title', '표지', '표지 제목', ('price_krw',)),
    B('cover_photo', '표지', '외관 사진 전면', ('photo_ext',),
      locked_msg='외부 사진 미제출 — 남색 표지로 대체'),
    B('hero', '표지·요약', '핵심 3숫자', ('price_krw', 'rr_rent')),
    B('unit_price', '표지·요약', '토지 평당가', ('price_krw',),
      (('land_sqm',),), '대지면적 미확보 — 지번 입력 후 자동'),
    B('acq_cost', '투자 구조', '총취득원가', ('price_krw',)),
    B('ltv', '투자 구조', 'LTV 3안 (가정)', ('price_krw', 'rr_rent', 'rr_deposit')),
    B('ltv_actual', '투자 구조', '실제 대출 조건 반영', ('loan_balance', 'loan_rate'),
      (), '대출 잔액·금리 미입력 — 가정치로만 산출'),
    B('yield', '투자 구조', '연 수익률 (총임대료 기준)', ('price_krw', 'rr_rent')),
    B('gross_income', '투자 구조', '월 총수입 (관리비 포함)', ('rr_mgmt', 'mgmt_bearer'),
      (), '관리비·부담 주체 미입력'),
    B('noi', '투자 구조', '연 순수입', ('opex_krw',),
      (), '운영비 미입력 — 연 순수입을 산출하지 않습니다'),
    B('net_yield', '투자 구조', '순수익률', ('opex_krw',),
      (), '운영비 미입력 — "순수익률" 라벨 금지'),

    B('overview_spec', '물건 개요', '공부 제원표', (),
      (('land_sqm',),), '지번 미입력 — 공부 조회 불가'),
    B('overview_photo', '물건 개요', '개요 사진', ('photo_ext',),
      (), '외부 사진 미제출'),
    B('crosscheck', '물건 개요', '공부 교차검증 X1~X4', (),
      (('land_sqm',),), '공부 미조회'),
    B('land_price', '가격 근거', '공시지가 배수', (),
      (('land_price_sqm',),), '공시지가 미조회'),

    B('location_transit', '입지', '역·정류장 거리표', (),
      (('transit',),), '지번 미입력 — 좌표 조회 불가'),
    B('location_road', '입지', '접면 도로·코너', ('road_width',),
      (), '접면 도로 폭 미입력 — 현장 확인 항목'),
    B('location_district', '입지', '상권 구성', (),
      (('district',),), '상권 조회 불가'),

    B('lease_table', '임대 현황', '임대 현황 표 (전량)',
      ('rr_unit', 'rr_business', 'rr_state', 'rr_expiry')),
    B('lease_sum', '임대 현황', '보증금·월세 합계', ('rr_deposit', 'rr_rent')),
    B('vacancy_unit', '임대 현황', '공실률 (구획 기준)', ('rr_state',)),
    B('vacancy_area', '임대 현황', '공실률 (면적 기준)', (),
      (('rr_area', 'floor_table'),), '임대면적·공부 층별개요 모두 미확보'),
    B('unit_rent', '임대 현황', '평당 임대료', (),
      (('rr_area', 'floor_table'),), '임대면적 미확보'),
    B('floor_logic', '임대 현황', '층별 단가 논리', (),
      (('rr_area', 'floor_table'),), '임대면적 미확보'),
    B('conv_deposit', '임대 현황', '환산보증금', ('rr_legal', 'rr_deposit', 'rr_rent'),
      (), '적용법령 미입력'),
    B('sangim', '임대 현황', '상가임대차법 전면적용 판정', ('rr_legal',),
      (), '적용법령 미입력'),
    B('combined_lease', '임대 현황', '통합계약 표기', ('rr_group',),
      (), '계약 그룹 미입력'),
    B('expiry_state', '임대 현황', '만료 경과·임박 구분', ('rr_expiry', 'rr_as_of')),
    B('expiry_timeline', '임대 현황', '만기 타임라인', ('rr_expiry',)),
    B('contract_age', '임대 현황', '계약 경과 연수', ('rr_start',),
      (), '현 계약 시작일 미입력'),
    B('renewal_right', '임대 현황', '갱신요구권 잔여', ('rr_first', 'rr_legal'),
      (), '최초 계약일 미입력 — 산출하지 않습니다 (불변조건 7)'),
    B('opposing_power', '임대 현황', '대항력 판정', ('rr_opposing',),
      (), '대항력 요건 미입력'),
    B('tenant_mix', '임대 현황', '임차 구성 서술', ('rr_business',)),

    B('comps_table', '가격 근거', '인근 실거래 비교표',
      ('comp_identify',), (('comps_raw',),),
      '실거래 원시자료만 있고 물건 식별 보강이 없습니다'),
    B('comps_land_unit', '가격 근거', '토지 평당가 비교', ('comp_land_sqm',),
      (('comps_raw',),),
      '비교 물건 대지면적 미입력 — API는 집합건물 대지면적을 주지 않습니다'),
    B('comps_reason', '가격 근거', '비교군 대비 차이 설명',
      ('comp_frontage',), (), '대로변·이면 구분 미입력'),

    B('rent_uplift', '개선 여력', '임대료 현실화 계획', ('rent_plan',),
      (), '현실화 계획 미입력'),
    B('vacancy_uplift', '개선 여력', '공실 임대 여력',
      ('vacancy_target', 'vacancy_comp'), (),
      '목표 임대료·비교 임대사례 미입력 — 금액을 산출하지 않습니다'),
    B('reno', '개선 여력', '리모델링·증축 계획', ('reno_plan',),
      (), '계획 미입력'),
    B('far_headroom', '개선 여력', '잔여 용적률', (),
      (('far_limit',),), '용도지역 미조회'),

    B('risk_ownership', '리스크', '소유 구조 리스크',
      ('ownership_type', 'owner_count'), (), '소유 형태·소유자 수 미입력'),
    B('risk_vacate', '리스크', '명도 리스크', ('vacate_duty',),
      (), '명도 책임 미입력'),

    B('photo_ext_page', '사진', '외부 사진 면', ('photo_ext',),
      (), '외부 사진 미제출'),
    B('photo_int_page', '사진', '내부 사진 면', ('photo_int',),
      (), '내부 사진 미제출'),

    B('terms', '거래 조건', '거래 조건표', ('price_krw',)),
    B('opinion', '거래 조건', '중개인 견해', ('broker_view',),
      (), '중개인 견해 미입력'),
    B('public_lookup', '전역', '공공 API 조회', ('address_jibun',),
      (), '지번 미입력'),

    # ── 필지·제척·토지이용 (D22-8 · CATALOG_RULES L10~L12) ─────────────
    B('parcel_table', '토지', '필지 명세 (L10)', ('parcel_list',),
      (), '필지 목록 미입력 — 단일 필지로 봅니다'),
    B('effective_area', '토지', '유효 대지면적 (P01·L11)',
      ('exclusion_area',), (), '제척 면적 미입력 — 대장 면적으로만 산출'),
    B('effective_far', '토지', '유효 용적률 (P02)',
      ('exclusion_area', 'exclusion_affects_far'), (),
      '제척 면적·산정 제외 여부 미입력'),
    B('zoning_filtered', '입지', '토지이용계획 목적별 표시 (L12)',
      ('buyer_purpose',), (('zoning',),),
      '매수 목적 미입력 — 전 항목을 같은 비중으로 냅니다'),
]

BLOCK_BY_KEY = {b.key: b for b in BLOCKS}


# ── 해상도 판정 ────────────────────────────────────────────────────────
L_REQ = {
    'R1': ('rr_unit', 'rr_business', 'rr_deposit', 'rr_rent',
           'rr_expiry', 'rr_state'),
    'R2': ('rr_area', 'rr_legal', 'rr_mgmt', 'rr_start'),
    'R3': ('rr_first', 'rr_opposing'),
}
P_REQ = {
    'P1': ('address_jibun',),
    'P2': ('land_sqm', 'gfa_sqm', 'zoning', 'land_price_sqm'),
    'P3': ('comp_identify', 'comp_land_sqm', 'photo_ext'),
}


def resolve(available: set[str]) -> tuple[str, str, dict]:
    """L축·P축 등급과 부족 항목을 함께 돌려줍니다."""
    short: dict[str, list[str]] = {}
    L = 'R0'
    for g in ('R1', 'R2', 'R3'):
        miss = [k for k in L_REQ[g] if k not in available]
        short[g] = miss
        if miss:
            break
        L = g
    P = 'P0'
    for g in ('P1', 'P2', 'P3'):
        miss = [k for k in P_REQ[g] if k not in available]
        short[g] = miss
        if miss:
            break
        P = g
    return L, P, short


def missing_for(b: Block, available: set[str]) -> list[str]:
    """이 블록을 열려면 아직 무엇이 필요한가. **있는 것은 빼고 말합니다.**

    고정 문구만 쓰면 "관리비·부담 주체 미입력" 처럼 이미 받은 것까지
    다시 달라고 하게 됩니다. 중개인이 두 번 찾습니다.
    """
    miss = [k for k in b.needs if k not in available]
    for grp in b.any_of:
        if not any(k in available for k in grp):
            miss.append(' 또는 '.join(label(k) for k in grp))
    return [label(k) if k in FIELD_BY_KEY else k for k in miss]


def evaluate(available: set[str]) -> list[tuple[Block, bool, str]]:
    """블록별 열림/잠김을 판정합니다. 잠김이면 사유를 함께 돌려줍니다."""
    out = []
    for b in BLOCKS:
        ok = all(k in available for k in b.needs)
        if ok:
            for grp in b.any_of:
                if not any(k in available for k in grp):
                    ok = False
                    break
        if ok:
            out.append((b, True, ''))
            continue
        why = b.locked_msg or '입력 부족'
        miss = missing_for(b, available)
        # 정책 문구(불변조건 인용 등)는 그대로 두고, 그렇지 않으면
        # **실제로 빠진 항목만** 이름으로 말합니다.
        if miss and '불변조건' not in why and '금지' not in why:
            why = f'{" · ".join(miss)} 미입력'
            if b.locked_msg and '—' in b.locked_msg:
                why += ' —' + b.locked_msg.split('—', 1)[1]
        out.append((b, False, why))
    return out


def label(key: str) -> str:
    f = FIELD_BY_KEY.get(key)
    return f.label if f else key


# ── 시나리오 (부록 C) ──────────────────────────────────────────────────
LEDGER_R1 = {'rr_as_of', 'rr_unit', 'rr_business', 'rr_deposit', 'rr_rent',
             'rr_expiry', 'rr_state', 'rr_group', 'rr_vat'}
PUBLIC_SET = set(PUBLIC_AUTO)

SCENARIOS = {
    '당산 ① 원장만': LEDGER_R1 | {'price_krw', 'rr_area', 'rr_legal',
                               'ownership_type', 'owner_count'},
    '당산 ② +공공결합': LEDGER_R1 | {'price_krw', 'rr_area', 'rr_legal',
                                'ownership_type', 'owner_count',
                                'address_jibun', 'photo_ext', 'photo_int'} | PUBLIC_SET,
    '당산 ③ +중개인 보강': LEDGER_R1 | {
        'price_krw', 'rr_area', 'rr_legal', 'rr_mgmt', 'rr_start',
        'ownership_type', 'owner_count', 'address_jibun',
        'photo_ext', 'photo_int', 'road_width', 'corner',
        'comp_identify', 'comp_frontage', 'comp_floors', 'comp_land_sqm',
        'comp_condition', 'rent_plan', 'broker_view', 'closing_plan',
        'vacate_duty', 'loan_assumable', 'mgmt_bearer'} | PUBLIC_SET,
    '양평 ② +공공결합': LEDGER_R1 | {'price_krw', 'rr_legal', 'rr_mgmt',
                                'rr_start', 'address_jibun',
                                'photo_ext'} | PUBLIC_SET,
}


def report(name: str, avail: set[str]) -> None:
    L, P, short = resolve(avail)
    ev = evaluate(avail)
    on = [b for b, ok, _ in ev if ok]
    off = [(b, why) for b, ok, why in ev if not ok]
    print(f'\n══ {name} ══')
    print(f'  임대차 해상도 {L} · 물건자료 해상도 {P} · '
          f'블록 {len(on)}/{len(ev)} 열림')
    for g in ('R1', 'R2', 'R3', 'P1', 'P2', 'P3'):
        if short.get(g):
            print(f'    {g} 부족 — ' +
                  ' · '.join(label(k) for k in short[g]))
            break
    if off:
        print('  잠긴 블록')
        for b, why in off:
            print(f'    [{b.page:<6}] {b.label:<22} {why}')


def main() -> int:
    print('필드 사전 — 총', len(FIELDS), '종')
    for t in (REQ, REC, OPT):
        ks = [f for f in FIELDS if f.tier == t]
        print(f'  {t} {len(ks):>2}종 · ' +
              ' · '.join(f.label for f in ks[:6]) +
              (' …' if len(ks) > 6 else ''))
    print('\n블록 —', len(BLOCKS), '종')
    for name, av in SCENARIOS.items():
        report(name, av)
    return 0


if __name__ == '__main__':
    sys.exit(main())
