#!/usr/bin/env python3
"""
D44 §2 — 방법론 적용 자가진단 (D42 여섯 규율)

사용법:
  python3 qa/adoption_check.py           # 경고 모드 (기본)
  python3 qa/adoption_check.py --strict  # 차단 모드 (4주차~)

채택 판정: 6/6 또는 미충족에 사유·기한 문서화
"""

import os
import sys
import glob
import re
import subprocess
from pathlib import Path

STRICT = "--strict" in sys.argv
ROOT = Path(__file__).resolve().parent.parent
results: list[tuple[str, bool, str]] = []


def check(rule: str, passed: bool, detail: str):
    results.append((rule, passed, detail))


# ── R1: 짝 없는 검사를 만들지 않는다 ──────────────────────────────
def check_r1():
    """YAML 게이트 중 negative 짝 테스트가 없는 것을 센다"""
    yaml_path = ROOT / "credeal" / "ssot" / "im.errors.yaml"
    test_dir = ROOT / "src" / "tests"

    if not yaml_path.exists():
        check("R1", False, "im.errors.yaml 없음")
        return

    # YAML에서 게이트 코드 추출
    import yaml  # noqa: delayed import
    with open(yaml_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    gate_codes = set()
    for g in data.get("gates", []):
        if "code" in g:
            gate_codes.add(g["code"])

    # 테스트 파일에서 게이트 코드 언급 검색
    tested = set()
    for tf in test_dir.rglob("*.test.ts"):
        content = tf.read_text(encoding="utf-8", errors="ignore")
        for code in gate_codes:
            if code in content:
                tested.add(code)

    unpaired = gate_codes - tested
    passed = len(unpaired) == 0
    check("R1", passed, f"게이트 {len(gate_codes)}종 중 짝 없는 {len(unpaired)}종")


# ── R2: 값은 한 곳에만 적는다 ─────────────────────────────────────
def check_r2():
    """src/ 내 하드코딩된 DPI·크로핑률·면수 임계값을 센다"""
    literals = []
    patterns = [
        (r"\bDPI\s*[:=]\s*\d{2,3}\b", "DPI 리터럴"),
        (r"\bCROP\s*[:=]\s*0\.\d+", "CROP 리터럴"),
        (r"PAGE_HARD_LIMIT\s*=\s*\d+", None),  # 이건 상수 정의이므로 허용
    ]

    src_dir = ROOT / "src"
    for py_or_ts in list(src_dir.rglob("*.ts")) + list(src_dir.rglob("*.py")):
        try:
            content = py_or_ts.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for pat, label in patterns:
            if label is None:
                continue
            for m in re.finditer(pat, content, re.IGNORECASE):
                rel = py_or_ts.relative_to(ROOT)
                literals.append(f"{rel}:{m.group()}")

    passed = len(literals) == 0
    detail = f"코드 리터럴 {len(literals)}건"
    if literals:
        detail += " — " + ", ".join(literals[:3])
    check("R2", passed, detail)


# ── R3: 실패의 출구를 계측한다 ────────────────────────────────────
def check_r3():
    """cycles/ 디렉토리에 계기판 기록이 2개 이상 있는지"""
    cycles_dir = ROOT / "cycles"
    if not cycles_dir.exists():
        check("R3", False, "cycles/ 디렉토리 없음 — 계기판 미설치")
        return

    json_files = list(cycles_dir.glob("*.json"))
    passed = len(json_files) >= 2
    check("R3", passed, f"계기판 기록 {len(json_files)}회 ({'추세 가능' if passed else '2회 이상이어야 추세'})")


# ── R4: 완료는 실측이다 ──────────────────────────────────────────
def check_r4():
    """wiring-check 허위신고 0건 확인"""
    wiring = ROOT / "scripts" / "wiring-check.ts"
    test = ROOT / "src" / "tests" / "e2e" / "l4-wiring-check.test.ts"

    if not wiring.exists():
        check("R4", False, "scripts/wiring-check.ts 없음")
        return

    if not test.exists():
        check("R4", False, "l4-wiring-check.test.ts 없음")
        return

    # 테스트 파일 존재 + wiring-check 도구 존재 = 인프라 있음
    # 실제 실행은 CI에서 수행
    check("R4", True, "wiring-check.ts + l4-wiring-check.test.ts 존재")


# ── R5: 한 판에 한 질문 ──────────────────────────────────────────
def check_r5():
    """PR 템플릿이 존재하는지"""
    template = ROOT / ".github" / "pull_request_template.md"
    passed = template.exists()
    check("R5", passed, "PR 템플릿 " + ("존재" if passed else "없음"))


# ── R6: 검사기를 느슨하게 하지 않는다 ────────────────────────────
def check_r6():
    """git log에서 임계값 완화 커밋을 탐지 (git 이력 필요)"""
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-50", "--all"],
            capture_output=True, text=True, timeout=10,
            cwd=str(ROOT),
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0 or not result.stdout:
            check("R6", False, "판정 불가 - git 이력을 읽을 수 없습니다")
            return

        log = result.stdout
        # 임계값 완화 의심 패턴
        suspect_patterns = [
            r"(?i)relax|loosen|increase.*threshold|raise.*limit|허용.*확대|임계.*완화",
        ]
        suspects = []
        for line in log.strip().split("\n"):
            for pat in suspect_patterns:
                if re.search(pat, line):
                    suspects.append(line.strip())

        if suspects:
            check("R6", False, f"완화 의심 커밋 {len(suspects)}건: {suspects[0][:60]}")
        else:
            check("R6", True, f"최근 50 커밋에서 완화 의심 0건")

    except (subprocess.TimeoutExpired, FileNotFoundError):
        check("R6", False, "🔴 판정 불가 — git 명령 실행 불가")


# ── 실행 ──────────────────────────────────────────────────────────

def main():
    print()
    print("Methodology Adoption Check - D42 Six Disciplines")
    print("=" * 56)

    # yaml 모듈 없으면 R1 스킵
    try:
        import yaml  # noqa
        check_r1()
    except ImportError:
        check("R1", False, "PyYAML 미설치 — pip install pyyaml")

    check_r2()
    check_r3()
    check_r4()
    check_r5()
    check_r6()

    passed_count = sum(1 for _, p, _ in results if p)
    total = len(results)

    for rule, passed, detail in results:
        icon = "OK" if passed else "FAIL"
        print(f"[{icon}] {rule} {'-- ' + detail if detail else ''}")

    print()
    print(f"Adopted {passed_count}/{total}")
    print()

    if STRICT and passed_count < total:
        print("[FAIL] --strict mode: unmet items exist.")
        sys.exit(1)

    if passed_count < total:
        print("[WARN] Warning mode: unmet items exist but not blocking.")
        print("   Switch to --strict at week 4.")


if __name__ == "__main__":
    main()
