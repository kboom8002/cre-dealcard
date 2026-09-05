#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stop_gate.py — Stop 훅. **R4 「완료는 자기 신고가 아니라 실측」의 문자 그대로의 구현.**

🔴 이 파일이 이 계획 전체에서 가장 중요합니다.

   AI 코딩 에이전트의 가장 흔한 실패는 코드를 잘못 쓰는 것이 아니라
   **「다 했습니다」라고 말하고 멈추는 것**입니다.
   여섯 판 동안 V4 14건 중 4건, V5 22건 중 1건만 실제로 이행되었고
   나머지는 「반영했다」고 적혀 있었습니다. 사람이 그랬습니다.
   에이전트는 그것을 훨씬 빠르고 자연스럽게 합니다.

   Stop 훅은 에이전트가 루프를 끝내려는 순간에 발화합니다.
   여기서 검사기를 돌리고, 실패하면 `decision: "continue"` 를 돌려
   **에이전트가 멈추지 못하게** 합니다. 이유는 시스템 메시지로 주입됩니다.

   즉 「완료」의 정의가 모델의 판단에서 검사기의 종료 코드로 옮겨갑니다.

입력(stdin)  : {"terminationReason":..., "fullyIdle":..., "workspacePaths":[...], ...}
출력(stdout) : {"decision":"continue"|"stop", "reason":"..."}
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

# ── 관문 ────────────────────────────────────────────────────────────────
#  (이름, 명령, 필수 여부)  ·  명령에 '{f}' 가 있으면 산출물마다 한 번씩 돕니다.
#
#  🔴 첫 판에서 여기를 틀렸습니다 — `--all` 이라는 없는 옵션을 줘서
#     layout_check·standard_check 가 예외로 죽었고, 종료 코드가 0이 아니라
#     **「차단」으로 집계**되었습니다. 메시지는 비어 있었고요.
#     항상 실패하는 관문은 반드시 꺼집니다. 그게 하네스가 죽는 방식입니다.
#     그래서 산출물 단위로 돌리고, 산출물이 없으면 차단이 아니라 **판정 불가**입니다.
ARTIFACT_GLOB = 'runs/**/*.pptx'

GATES = [
    ('배선 (선언↔실행)', ['python3', 'qa/wiring_check.py'], True),
    ('대조군 검출률',     ['python3', 'qa/mutate_sample.py', '--score', 'runs/mutants'], True),
    ('지면 물리',         ['python3', 'qa/layout_check.py', '{f}'], True),
    ('정본 준수',         ['python3', 'qa/standard_check.py', '{f}', '--kind', 'pptx'], True),
    ('문서 정합',         ['python3', 'qa/doc_integrity.py'], False),
]

MAX_RETRY = 3          # 🔴 무한 루프 방지. 3회 막고도 안 되면 사람에게 넘깁니다
STATE = Path('.agents/.stop_gate_state.json')


def _load() -> int:
    try:
        return json.loads(STATE.read_text())['blocked']
    except Exception:
        return 0


def _save(n: int) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({'blocked': n}))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    # 🔴 배경 작업이 아직 돌고 있으면 판정하지 않습니다.
    #    반쯤 끝난 상태에서 검사하면 매번 실패하고, 그러면 이 훅이 꺼집니다.
    if not payload.get('fullyIdle', True):
        print(json.dumps({'decision': 'stop'}))
        return 0

    ws = (payload.get('workspacePaths') or [os.getcwd()])[0]

    arts = sorted(Path(ws).glob(ARTIFACT_GLOB))

    def run(cmd):
        try:
            r = subprocess.run(cmd, cwd=ws, capture_output=True,
                               text=True, timeout=180)
        except subprocess.TimeoutExpired:
            return None, '시간 초과'
        tail = [l for l in ((r.stdout or '') + (r.stderr or '')).splitlines()
                if l.strip()][-3:]
        return r.returncode, ' / '.join(tail)[:300]

    failed, skipped = [], []
    for name, cmd, required in GATES:
        if not (Path(ws) / cmd[1]).exists():
            skipped.append(f'{name} (검사기 없음)')
            continue
        if '{f}' in cmd:
            if not arts:
                # 🔴 산출물이 없으면 「통과」가 아니라 「판정 불가」입니다.
                skipped.append(f'{name} (산출물 0건)')
                continue
            for a in arts:
                rc, why = run([c.replace('{f}', str(a)) for c in cmd])
                if rc != 0:
                    failed.append((f'{name} · {a.name}', why, required))
        else:
            rc, why = run(cmd)
            if rc != 0:
                failed.append((name, why, required))

    blocked = _load()
    hard = [f for f in failed if f[2]]

    if hard and blocked < MAX_RETRY:
        _save(blocked + 1)
        lines = [
            '🔴 완료할 수 없습니다. 검사기가 실패했습니다 (R4 — 완료는 실측입니다).',
            '',
        ]
        for name, why, req in failed:
            lines.append(f'  [{"차단" if req else "주의"}] {name} — {why}')
        lines += [
            '',
            '🔴 다음 중 하나만 하십시오.',
            '   ① 원인을 고칩니다 (검사기가 아니라 코드를).',
            '   ② 고칠 수 없으면 **멈추지 말고** 무엇이 왜 막혔는지 적고 사람을 부르십시오.',
            '',
            '🔴 하지 말 것 — 검사기 파일·임계값·기준선을 고쳐서 통과시키는 것 (R6).',
            '   그 편집은 PreToolUse 훅이 차단합니다.',
            f'   (막힌 횟수 {blocked + 1}/{MAX_RETRY})',
        ]
        print(json.dumps({'decision': 'continue', 'reason': '\n'.join(lines)},
                         ensure_ascii=False))
        return 0

    _save(0)
    note = ''
    if hard:
        note = (f'🔴 검사기가 여전히 실패하지만 {MAX_RETRY}회를 넘겨 사람에게 넘깁니다. '
                '이 대화는 「완료」가 아닙니다.')
    if skipped:
        note += f' (미실행 관문: {", ".join(skipped)} — 파일 없음. 통과가 아니라 판정 불가입니다.)'
    out = {'decision': 'stop'}
    if note:
        out['reason'] = note.strip()
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
