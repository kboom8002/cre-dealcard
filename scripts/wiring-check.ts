import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface GateDef {
  code: string;
  label: string;
  level: string;
  status: string;
}

function run() {
  const yamlPath = path.resolve(process.cwd(), 'credeal/ssot/im.errors.yaml');
  const tsPath = path.resolve(process.cwd(), 'src/domain/building/mobile-im/quality-gates-v02.ts');

  if (!fs.existsSync(yamlPath)) {
    console.error(`YAML file not found: ${yamlPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error(`TS file not found: ${tsPath}`);
    process.exit(1);
  }

  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const doc = yaml.load(yamlContent) as { gates: GateDef[] };

  const tsContent = fs.readFileSync(tsPath, 'utf8');
  const regex = /id:\s*'(G\d+|QG\d+)'/g;
  const codeGateIds = new Set<string>();
  let match;
  while ((match = regex.exec(tsContent)) !== null) {
    codeGateIds.add(match[1]);
  }

  const yamlGates = doc.gates || [];
  const yamlGateCodes = new Set(yamlGates.map(g => g.code));

  const wired: string[] = [];
  const falseAlarms: string[] = []; // 허위신고
  const undeclared: string[] = []; // 미선언

  for (const g of yamlGates) {
    if (codeGateIds.has(g.code)) {
      wired.push(g.code);
    } else if (g.status !== '폐기') {
      falseAlarms.push(g.code);
    }
  }

  for (const code of Array.from(codeGateIds)) {
    if (!yamlGateCodes.has(code)) {
      undeclared.push(code);
    }
  }

  const result = {
    wired: wired.length,
    falseAlarms: falseAlarms.length,
    undeclared: undeclared.length,
    details: {
      wired,
      falseAlarms,
      undeclared
    }
  };

  console.log(JSON.stringify(result, null, 2));

  if (falseAlarms.length > 0) {
    process.exit(1);
  }
}

run();
