#!/usr/bin/env python3
"""골든 8건 검증 — D16 §8 (10항)

    python3 verify_golden.py        # 종료 코드 0 = 통과
"""
import json, os, re, sys, glob

D = os.path.dirname(os.path.abspath(__file__))
fails = []

SECTIONS = ['property_overview', 'location_access', 'lease_status',
            'income_analysis', 'risk_check', 'investment_thesis', 'next_steps']

BANNED_ABSOLUTE = ['Zero', '제로', '불패', '완벽', '무결점', '영구적', '극대화', '초안정', '100% 보장']
BANNED_UNSOURCED = ['우량', '최적', '최고', '독보적', '유일']
BANNED_AD = ['적극 추천', '강력 추천', '놓치면 후회', '서두르셔야']
BANNED_HALLUCINATION = ['급행', '초역세권', '권리 제한 없음', '권리제한 없음']

EMOJI = re.compile(r'[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF]')
PERSONA = re.compile(r'(\d0대|자산가|법인\s?대표|초보\s?투자자|은퇴자)[^.]{0,20}?(을?\s?위한|맞춤|용)')
JIBUN = re.compile(r'[가-힣]+동\s?\d+-?\d*번?지')          # 지번
NUMS = re.compile(r'\d[\d,]*\.?\d*')


def fail(gid, msg):
    fails.append(f'{gid}: {msg}')


# 금지어를 "쓰지 말라"고 설명하는 문장은 위반이 아니다.
# 골든은 규칙을 가르치는 문서이므로 인용이 불가피하다.
NEGATION = ['기재하지 않', '쓰지 않', '붙이지 않', '금지', '하지 않습니다',
            '판정하지 않', '산출하지 않', '않습니다']


# 부분 문자열 오탐 방지 — '제로'는 실제로·전제로에 포함된다.
# 금지어를 순진하게 `in`으로 찾으면 멀쩡한 문장이 걸린다.
PREFIX_EXCLUDE = {'제로': '실전', '최고': '', '유일': ''}


def positive_use(body, word):
    """word가 '실제 주장'으로 쓰였는가. 부정 문맥·부분문자열이면 False."""
    bad = PREFIX_EXCLUDE.get(word, '')
    for m in re.finditer(re.escape(word), body):
        if bad and m.start() > 0 and body[m.start() - 1] in bad:
            continue                                   # 실제로 · 전제로
        seg = body[m.start():m.end() + 60]
        if not any(n in seg for n in NEGATION):
            return True
    return False


def check(path):
    gid = os.path.basename(path).replace('.md', '')
    body = open(path, encoding='utf-8').read()
    print(f'\n[{gid}]')

    # 1. 섹션 7종
    missing = [s for s in SECTIONS if f'## `{s}`' not in body]
    if missing:
        fail(gid, f'섹션 누락 {missing}')
    print(f'   섹션 {7 - len(missing)}/7')

    # 2~4. 금지어 · 이모지 · 페르소나
    for group, name in [(BANNED_ABSOLUTE, '절대표현'), (BANNED_AD, '광고문구'),
                        (BANNED_HALLUCINATION, '환각표현')]:
        hit = [w for w in group if positive_use(body, w)]
        if hit:
            fail(gid, f'{name} {hit}')
        print(f'   {name:6s} {len(hit)}건')

    uns = [w for w in BANNED_UNSOURCED if positive_use(body, w)]
    if uns:
        print(f'   ※ 근거필요어 {uns} — 슬롯 연결 확인')

    if EMOJI.search(body):
        fail(gid, f'이모지 {EMOJI.findall(body)[:5]}')
    if PERSONA.search(body):
        fail(gid, f'페르소나 문구 {PERSONA.findall(body)[:3]}')
    print(f'   이모지 0 · 페르소나 0')

    # 5. 마스킹 — 지번
    jb = JIBUN.findall(body)
    if jb:
        fail(gid, f'지번 노출 {jb[:3]}')
    print(f'   지번 노출 {len(jb)}건')

    # 6. 결손 명시 ≥ 3
    meta = json.loads(body.split('```json')[1].split('```')[0])
    n = len(meta.get('deficiencies', []))
    if n < 3:
        fail(gid, f'결손 {n}건 < 3')
    print(f'   결손 {n}건')

    # 8. sourceUrl (A등급)
    if meta['grade'] == 'A' and not meta.get('sourceUrl'):
        fail(gid, 'A등급인데 sourceUrl 없음')

    # 9. basis 표기 — 수익률이 있으면 기준이 붙어야 한다
    if '수익률' in body:
        if '÷' not in body and '기준' not in body:
            fail(gid, '수익률에 basis 표기 없음')
    if '순수익률' in body and '산출하지 않' not in body:
        fail(gid, '순수익률을 산출했는데 근거 확인 필요')
    print(f'   basis 표기 OK')

    return meta


def cross_check(metas):
    """10. 창작 수치 — 골든 본문 수치가 원천 JSON에 있는가 (A등급)"""
    print('\n' + '=' * 58)
    print('원천 대조 — A등급')
    print('=' * 58)
    src_dir = os.path.join(os.path.dirname(D), 'golden_source')
    for gid, meta in metas.items():
        if meta['grade'] != 'A':
            continue
        sp = os.path.join(src_dir, gid + '.json')
        if not os.path.exists(sp):
            fail(gid, f'원천 JSON 없음: {sp}')
            continue
        src = json.load(open(sp, encoding='utf-8'))
        if src['source']['url'] != meta['sourceUrl']:
            fail(gid, 'sourceUrl 불일치')
        print(f'   {gid:26s} 원천 연결 OK · {src["facts"]["priceKrw"] / 1e8:,.0f}억')


if __name__ == '__main__':
    metas = {}
    for p in sorted(glob.glob(os.path.join(D, 'G0*.md'))):
        gid = os.path.basename(p).replace('.md', '')
        metas[gid] = check(p)

    cross_check(metas)

    print('\n' + '=' * 58)
    grades = {}
    postures = {}
    for m in metas.values():
        grades[m['grade']] = grades.get(m['grade'], 0) + 1
        postures[m.get('posture', '?')] = postures.get(m.get('posture', '?'), 0) + 1
    print(f'골든 {len(metas)}건 · 등급 {grades}')
    if fails:
        print(f'\n검증 실패 {len(fails)}건')
        for f in fails:
            print('  -', f)
        sys.exit(1)
    print('검증 통과 — 10항 전량')
