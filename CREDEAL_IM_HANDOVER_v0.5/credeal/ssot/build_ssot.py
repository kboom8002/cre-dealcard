#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ssot.py — 코드에 있는 규칙을 SSoT YAML로 내보냅니다.

**손으로 쓴 정본** (사람이 관리)
    im.lexicon.yaml · im.format.yaml · im.masking.yaml · im.invariants.yaml
**코드에서 생성** (이 스크립트)
    im.gating.yaml · im.tokens.yaml · im.budget.yaml

두 갈래를 섞지 않습니다. 생성본을 손으로 고치면 다음 빌드에 사라집니다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import input_spec as I           # noqa: E402
import presets as PS             # noqa: E402


class Dumper(yaml.SafeDumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def dump(name: str, data: dict) -> Path:
    p = HERE / name
    head = (f'# 이 파일은 build_ssot.py 가 생성합니다. 손으로 고치지 마십시오.\n'
            f'# 정본 코드: credeal/input_spec.py · credeal/presets.py\n')
    p.write_text(head + yaml.dump(data, Dumper=Dumper, allow_unicode=True,
                                  sort_keys=False, width=100),
                 encoding='utf-8')
    return p


def gating() -> dict:
    return {
        'meta': {'id': 'im.gating', 'version': 1,
                 'owner': 'credeal/input_spec.py (생성본)',
                 'fields': len(I.FIELDS), 'blocks': len(I.BLOCKS)},
        'tiers': {'required': I.REQ, 'recommended': I.REC, 'optional': I.OPT},
        'source_grades': {'S1': '공부', 'S2a': '공공 API 원시',
                          'S2b': '공공 API + 중개인 보강', 'S3': '중개인 입력',
                          'S5': '가정'},
        'axes': {
            'L': {'label': '임대차 해상도',
                  'levels': {k: list(v) for k, v in I.L_REQ.items()}},
            'P': {'label': '물건자료 해상도',
                  'levels': {k: list(v) for k, v in I.P_REQ.items()}},
        },
        'grade_map': [
            {'grade': 'A', 'when': 'L>=R2 and P>=P2', 'deck': '풀 기관투자 덱'},
            {'grade': 'B', 'when': 'L>=R1 and P>=P2', 'deck': '공공 결합 표준 덱'},
            {'grade': 'C', 'when': 'L>=R1 and P==P1', 'deck': '원장 기반 덱'},
            {'grade': 'D', 'when': 'L==R0 or P==P0', 'deck': '최소 덱 · 내부 검토용'},
        ],
        'public_auto': dict(I.PUBLIC_AUTO),
        'fields': [
            {'key': f.key, 'group': f.group, 'label': f.label, 'tier': f.tier,
             'grade': f.grade, 'dtype': f.dtype, 'axis': f.axis or None,
             'opens': list(f.opens), 'note': f.note or None}
            for f in I.FIELDS],
        'blocks': [
            {'key': b.key, 'page': b.page, 'label': b.label,
             'needs': list(b.needs),
             'any_of': [list(g) for g in b.any_of] or None,
             'locked_msg': b.locked_msg or None}
            for b in I.BLOCKS],
    }


def tokens() -> dict:
    t = PS.BASE
    return {
        'meta': {'id': 'im.tokens', 'version': 1,
                 'owner': 'credeal/presets.py (생성본)',
                 'note': '현행 53토큰 + 신설 7종 = 60'},
        'new_tokens': {
            'priceHi': '매매가 강조 — 국내 IM 사실상 표준',
            'priceHiBg': '매매가 강조 배경',
            'labelCol': '표 라벨 열 바탕',
            'labelColTx': '표 라벨 열 글씨',
            'srcChip': '출처 칩 글씨',
            'srcChipBg': '출처 칩 바탕',
            'needsCheck': '확인 필요 전용색',
        },
        'base': dict(t),
        'presets': [
            {'key': p.key, 'name': p.name, 'cover': p.cover,
             'layout': p.layout, 'target': p.target,
             'switches': dict(p.switches),
             'tokens_override': {k: v for k, v in p.tokens.items()
                                 if PS.BASE.get(k) != v},
             'wcag': [{'pair': lb, 'ratio': round(r, 2), 'need': need, 'ok': ok}
                      for lb, r, need, ok in PS.validate(p)],
             'mono': [{'pair': lb, 'gap': round(g, 3), 'ok': ok}
                      for lb, g, ok in PS.mono_gap(p)]}
            for p in PS.PRESETS.values()],
        'existing_presets': list(PS.BUILTIN_EXISTING),
    }


def budget() -> dict:
    return {
        'meta': {'id': 'im.budget', 'version': 1,
                 'owner': 'D19 §6C · IM_STANDARD_수익형.md §3.1·§4.7·§5.5'},
        'deck': {'required_pages': 12, 'max_pages_default': 16,
                 'max_pages_evidence': 18,
                 'note': '30p+ 는 정본 기준 과함 · 부티크 작성 불가'},
        'canvas': {'w_in': 13.333, 'h_in': 7.5, 'margin_in': 0.62,
                   'content_w_in': 12.093, 'safe_right_in': 12.713,
                   'safe_bottom_in': 6.75},
        'type': {
            'pptx': {'hero': 26, 'title': 22, 'sub': 13, 'body': 11.5,
                     'table': 9.5, 'caption': 8.5},
            'web': {'hero': 30, 'title': 23, 'sub': 17, 'body': 17,
                    'table': 14.5, 'caption': 13},
            'min': {'pptx_body': 11, 'pptx_table': 9, 'web_body': 16},
        },
        'truncation': {
            'never': ['라벨', '표 헤더', '단위', '출처', '슬라이드 제목', '수치'],
            'allowed': ['자유서술 본문'],
            'overflow_policy': '폰트 축소 → 다음 면으로 흘림 → 그래도 넘치면 빌드 중단',
            'incident': 'D17 E01 — "현재 연 순수익률 (Cap R" · 20자 예산을 라벨에 적용',
        },
        'sentence': {
            'pptx_line_max': 45,
            'mobile_sentence_max': 40,
            'mobile_oneliner_max': 25,
            'mobile_section_title_max': 12,
            'paragraph_max_sentences': 3,
            'styles': {
                'slide_bullet': '개조식(명사형)',
                'warning': '완결문장',
                'opinion': '완결문장 · "저희가 보기에" 접두',
                'caption': '개조식',
            },
        },
        'table': {'max_tables_per_page': 2,
                  'note': '§4.7은 1개를 권하나 §4.3이 p6에 두 표를 둡니다'},
    }


def main() -> int:
    for name, data in (('im.gating.yaml', gating()),
                       ('im.tokens.yaml', tokens()),
                       ('im.budget.yaml', budget())):
        p = dump(name, data)
        print(f'  {p.name:<20} {p.stat().st_size / 1024:>6,.1f} KB')
    # 손으로 쓴 정본도 파싱되는지 확인합니다
    for name in ('im.lexicon.yaml', 'im.format.yaml', 'im.masking.yaml',
                 'im.invariants.yaml'):
        d = yaml.safe_load((HERE / name).read_text(encoding='utf-8'))
        print(f'  {name:<20} 파싱 OK · 최상위 키 {len(d)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
