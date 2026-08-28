/**
 * D41 W1-4 + W2-2: 선언 ↔ 실행 대조 + 심각도 단일성 테스트
 *
 * W1-4: im.errors.yaml에 선언된 게이트가 quality-gates-v02.ts에 배선되어 있는지
 * W2-2: 한 코드 = 한 심각도 (YAML level과 코드 severity 일치)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface YamlGateDef {
  code: string;
  label: string;
  level: string;
  status?: string;
}

interface YamlDoc {
  gates: YamlGateDef[];
}

// severity 매핑: YAML 한국어 → 코드 영어
const LEVEL_MAP: Record<string, string> = {
  '차단': 'block',
  '경고': 'warn',
  '치환': 'warn',  // 치환은 warn 수준으로 취급
};

describe('D41 W1-4: 선언 ↔ 실행 대조', () => {
  const yamlPath = path.resolve(process.cwd(), 'credeal/ssot/im.errors.yaml');
  const tsPath = path.resolve(process.cwd(), 'src/domain/building/mobile-im/quality-gates-v02.ts');

  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const doc = yaml.load(yamlContent) as YamlDoc;
  const yamlGates = doc.gates || [];

  const tsContent = fs.readFileSync(tsPath, 'utf8');
  const codeGateIds = new Set<string>();
  const codeGateSeverity = new Map<string, string>();
  const regex = /id:\s*'(G\d+|QG\d+)'.*?severity:\s*'(\w+)'/g;
  let match;
  while ((match = regex.exec(tsContent)) !== null) {
    codeGateIds.add(match[1]);
    codeGateSeverity.set(match[1], match[2]);
  }

  // 등록 상태이면서 코드에 없는 것 = 허위신고
  const activeYamlGates = yamlGates.filter(g => g.status !== '폐기' && g.status !== '등록요청');

  it('허위신고 0건 — 등록 상태의 YAML 게이트는 코드에 모두 배선되어야 합니다', () => {
    const falseAlarms = activeYamlGates
      .filter(g => !codeGateIds.has(g.code))
      .map(g => g.code);
    expect(falseAlarms, `허위신고 게이트: ${falseAlarms.join(', ')}`).toEqual([]);
  });

  it('미선언 0건 — 코드의 게이트는 YAML에 모두 선언되어야 합니다', () => {
    const yamlCodes = new Set(yamlGates.map(g => g.code));
    const undeclared = Array.from(codeGateIds)
      .filter(code => !yamlCodes.has(code));
    expect(undeclared, `미선언 게이트: ${undeclared.join(', ')}`).toEqual([]);
  });
});

describe('D41 W2-2: 한 코드 = 한 심각도', () => {
  const yamlPath = path.resolve(process.cwd(), 'credeal/ssot/im.errors.yaml');
  const tsPath = path.resolve(process.cwd(), 'src/domain/building/mobile-im/quality-gates-v02.ts');

  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const doc = yaml.load(yamlContent) as YamlDoc;
  const yamlGates = doc.gates || [];

  const tsContent = fs.readFileSync(tsPath, 'utf8');
  const codeGateSeverity = new Map<string, string>();

  // id와 severity를 한 줄에서 추출
  const lines = tsContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(/id:\s*'(G\d+|QG\d+)'/);
    if (idMatch) {
      const sevMatch = lines[i].match(/severity:\s*'(\w+)'/);
      if (sevMatch) {
        codeGateSeverity.set(idMatch[1], sevMatch[1]);
      }
    }
  }

  it('YAML level과 코드 severity가 일치해야 합니다', () => {
    const mismatches: string[] = [];

    for (const g of yamlGates) {
      if (g.status === '폐기') continue;
      const codeSev = codeGateSeverity.get(g.code);
      if (!codeSev) continue; // 코드에 없으면 W1에서 검사

      const expectedSev = LEVEL_MAP[g.level];
      if (expectedSev && expectedSev !== codeSev) {
        mismatches.push(`${g.code}: YAML=${g.level}(${expectedSev}) vs code=${codeSev}`);
      }
    }

    expect(mismatches, `심각도 불일치:\n${mismatches.join('\n')}`).toEqual([]);
  });
});
