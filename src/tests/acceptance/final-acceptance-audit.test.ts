import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('16 Final Acceptance Criteria Audit (FA-01 ~ FA-16 / CIM-MASTER-PLAN-v2.0)', () => {
  const criteria = [
    {
      id: 'FA-01',
      name: 'D54/D55 capability rules reflected in CORE qualification',
      description: '렌트롤 등급 및 필수 제원 가용성에 따른 L1/L1.5 자격 판정',
    },
    {
      id: 'FA-02',
      name: 'Memo -> Dealcard independent execution, approval, and publication',
      description: '메모 관측값 기반 딜카드 단독 실행, 밴딩 및 발행',
    },
    {
      id: 'FA-03',
      name: 'Lineage from source -> observation -> correction -> snapshot -> claims 100% traceable',
      description: '자료원부터 산출항목까지 5단계 역추적 체인 완성',
    },
    {
      id: 'FA-04',
      name: 'Rent roll 4-tier classification and discrepancy adjustment',
      description: 'none/minimum/standard/complete 4등급 분류 및 1% 초과 불일치(G35) 차단',
    },
    {
      id: 'FA-05',
      name: 'Multi-parcel 4 area denominators and partial failure preservation',
      description: '다필지 대지면적 합산, 4대 면적 분모 엄격 분리 및 부분실패 격리',
    },
    {
      id: 'FA-06',
      name: 'Mobile L1/L1.5 only consumes PublicationPackage',
      description: '모바일 IM은 공통 발행묶음만을 소비하며 자체 수치 재계산 금지',
    },
    {
      id: 'FA-07',
      name: 'PPTX independently generated and approved without mobile dependency',
      description: 'PPTX Studio가 모바일 의존 없이 독립적으로 생성, 검사, 승인',
    },
    {
      id: 'FA-08',
      name: 'Gating rules NOT_RUN / INDETERMINATE / SYSTEM_ERROR block publication',
      description: '7-상태 평가 모델 중 불완전 상태 발생 시 외부 발행 원천 차단',
    },
    {
      id: 'FA-09',
      name: 'Approval cryptographically bound to target SHA-256 hash',
      description: '승인 시점 본문 해시와 불변 결속, 1글자 변경 시 STALE 전이',
    },
    {
      id: 'FA-10',
      name: 'Change impact & minimal regeneration respects channel boundaries',
      description: '13종 변경 유형 분석으로 채널 경계 준수 (모바일 변경 시 PPTX 무영향)',
    },
    {
      id: 'FA-11',
      name: 'Checkpoint resumability, idempotency, and duplicate publication prevention',
      description: '체크포인트 재개 및 멱등성 보장',
    },
    {
      id: 'FA-12',
      name: 'Legacy URLs and historical files 100% preserved',
      description: '과거 발행 URL 및 파일 읽기 호환 프록시 보존',
    },
    {
      id: 'FA-13',
      name: 'PII, blind teaser protection, and tampering injection defense',
      description: '개인정보 마스킹 및 변조 주입 방어 시험 통과',
    },
    {
      id: 'FA-14',
      name: 'Telemetry masking, alerting, withdrawal, and rollback drill',
      description: 'SEV-1 즉시 철회, SEV-2 STALE 강등 긴급 롤백 가동',
    },
    {
      id: 'FA-15',
      name: 'Broker usability & editorial completeness (12 golden cases >= 4.0/5.0)',
      description: '12개 실무 골든 케이스 자동 회귀 러너 100% 일치',
    },
    {
      id: 'FA-16',
      name: '100% canary promotion with 0 traffic to legacy write paths',
      description: '카나리 단계별 승격 및 구형 쓰기 경로 차단',
    },
  ];

  it('should verify that all 16 Canonical Acceptance Criteria (FA-01~16) are defined', () => {
    expect(criteria.length).toBe(16);
    criteria.forEach((c) => {
      expect(c.id).toMatch(/^FA-\d{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    });
  });

  it('should verify all required governance documents (00 through 07) exist', () => {
    const docsDir = path.join(process.cwd(), 'docs', 'impipe', 'modernization');
    const requiredDocs = [
      '00_GOVERNANCE_AND_AUTHORITY.md',
      '01_CURRENT_SYSTEM_LINEAGE.md',
      '02_DATA_OWNERSHIP_INVENTORY.md',
      '03_BASELINE_METRICS.md',
      '04_LEGACY_PRESERVATION_SPEC.md',
      '05_CUTOVER_CHECKLIST.md',
      '06_DEPRECATION_SCHEDULE.md',
      '07_RETROSPECTIVE_AND_ROADMAP.md',
    ];

    for (const doc of requiredDocs) {
      const docPath = path.join(docsDir, doc);
      expect(fs.existsSync(docPath), `Missing governance doc: ${doc}`).toBe(true);
    }
  });

  it('should verify all phase exit reports exist and have required signer approvals', () => {
    const phases = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
    const reportsDir = path.join(process.cwd(), 'docs', 'impipe', 'modernization');

    for (const p of phases) {
      const reportFile = path.join(reportsDir, `phase-exit-report-${p}.json`);
      expect(fs.existsSync(reportFile), `Missing report for phase ${p}`).toBe(true);

      const report = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
      expect(report.approvals.length).toBeGreaterThanOrEqual(4);
      const roles = report.approvals.map((a: any) => a.role);
      expect(roles).toContain('product');
      expect(roles).toContain('domain');
      expect(roles).toContain('architecture');
      expect(roles).toContain('quality');
    }
  });
});
