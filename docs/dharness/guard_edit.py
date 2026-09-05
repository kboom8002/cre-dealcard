#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
guard_edit.py — PreToolUse 훅. **R6 「검사기가 불편한 답을 낼 때 검사기를 고치지 않는다」의 강제.**

🔴 R6 은 방법론에서 「자동화할 수 없다」고 적은 규율입니다.
   임계값 변경이 정당한 경우가 있으니까요.
   그래서 여기서도 **차단(deny)이 아니라 강제 질문(force_ask)** 을 씁니다.
   사람이 매번 눈으로 보고 승인하게 만드는 것이 목적입니다.

   에이전트에게 「검사기를 고치지 마라」고 규칙으로 적어 두면,
   90% 는 지키고 10% 는 막다른 골목에서 지키지 않습니다.
   그리고 그 10% 가 정확히 우리가 놓치면 안 되는 순간입니다.

차단(deny) 하는 것은 셋뿐입니다 — 되돌릴 수 없거나 판정을 무의미하게 만드는 것.
"""
from __future__ import annotations

import json
import re
import sys

# ── 강제 확인 — 사람이 매번 봐야 하는 편집 ──────────────────────────────
ASK_PATHS = [
    (r'(^|/)qa/.*\.py$',                  'R6 · 검사기 코드'),
    (r'(^|/)credeal/ssot/im\..*\.yaml$',  'R2 · SSoT 레지스트리'),
    (r'(^|/)tests/corpus/.*\.(yaml|json)$', '수용 기준 · 참조 지문'),
    (r'(^|/)\.agents/(hooks\.json|scripts/)', '하네스 자신'),
    (r'(^|/)\.github/workflows/',          'CI 정의'),
]

# ── 하드 차단 — 어떤 이유로도 에이전트가 하지 않습니다 ──────────────────
DENY_PATHS = [
    (r'(^|/)cycles/.*\.json$',
     '계기판 기준선입니다. 과거 기록을 고치면 추세가 거짓이 됩니다 (A6 기준선 부패)'),
    (r'(^|/)qa/coverage_baseline\.json$',
     '커버리지 기준선. 낮추는 방향의 변경은 사람만 합니다'),
    (r'(^|/)qa/doc_baseline\.json$',
     '문서 기준선(래칫). 늘리는 방향으로 고치면 래칫이 무의미해집니다'),
    (r'(^|/)tests/corpus/target_.*\.pptx$',
     '동결된 골든. 정본 변경 + 근거 ID + 2인 서명이 있어야 바뀝니다 (D43 §12.2)'),
]

# ── 내용 기반 — 경로는 무해한데 내용이 하네스를 무디게 하는 경우 ────────
CONTENT_ASK = [
    (r'\b(MIN_|MAX_|THRESHOLD|TOLERANCE|허용오차)\w*\s*=', '임계값 변경'),
    (r'severity\s*[:=]\s*[\'"]?(warn|warning|info)', '심각도 강등 (A5 심각도 세탁)'),
    (r'except\s+\w*\s*:?\s*(pass|continue)', '예외 삼킴 (A3 정교한 폴백)'),
    (r'@(pytest\.mark\.)?(skip|xfail)', '테스트 건너뛰기 (A9 조용한 이관)'),
    (r'\|\|\s*true|\breturn\s+True\s*#\s*(임시|TODO|temporarily)', '무조건 통과'),
]


def out(decision: str, reason: str = '') -> None:
    print(json.dumps({'decision': decision, 'reason': reason},
                     ensure_ascii=False))
    sys.exit(0)


def main() -> None:
    try:
        p = json.load(sys.stdin)
    except Exception:
        out('allow')

    args = (p.get('toolCall') or {}).get('args') or {}
    path = (args.get('TargetFile') or '').replace('\\', '/')
    body = ' '.join(str(args.get(k, '')) for k in
                    ('CodeContent', 'ReplacementContent', 'Instruction'))
    chunks = args.get('ReplacementChunks') or []
    if isinstance(chunks, list):
        body += ' ' + ' '.join(str(c.get('ReplacementContent', '')) for c in chunks
                               if isinstance(c, dict))

    for pat, why in DENY_PATHS:
        if re.search(pat, path):
            out('deny',
                f'🔴 이 파일은 에이전트가 고칠 수 없습니다 — {why}\n'
                f'   변경이 정말 필요하면 사람이 직접 커밋하고, 그 이유를 '
                f'CHANGELOG 에 남기십시오.')

    for pat, why in ASK_PATHS:
        if re.search(pat, path):
            out('force_ask',
                f'🔴 {why} 를 고치려 합니다.\n'
                f'   먼저 답하십시오 — **검사기가 틀렸습니까, 코드가 틀렸습니까?**\n'
                f'   여섯 판 동안 일곱 번 다 코드가 틀렸습니다.\n'
                f'   검사기가 정말 틀렸다면 그 근거를 대조군으로 보이십시오 '
                f'(고친 뒤에도 기존 결함을 여전히 잡는가).')

    for pat, why in CONTENT_ASK:
        if re.search(pat, body, re.I):
            out('force_ask',
                f'🔴 {why} 로 보이는 편집입니다 ({path}).\n'
                f'   실패를 고친 것입니까, 실패가 보이지 않게 한 것입니까?\n'
                f'   흡수 경로는 계기판 ③에 잡히고, 2주 연속 증가하면 커밋을 되돌립니다.')

    out('allow')


if __name__ == '__main__':
    main()
