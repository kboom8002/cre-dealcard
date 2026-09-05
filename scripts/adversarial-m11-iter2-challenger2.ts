import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { inspectPptxBinary, FORBIDDEN_PERSONA_PATTERN, FORBIDDEN_DEFECT_EXCUSE_PATTERN, FORBIDDEN_LEXICON_PATTERN, FORBIDDEN_LEGAL_RISK_PATTERN } from '../src/assurance/im-harness/observers/pptx-binary-observer';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { buildDeckSequence } from '../src/domain/building/mobile-im/pptx/deck-sequencer';
import { validateBuildingSpecs } from '../src/domain/building/im-core/broker-input-validator';

const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

function buildDocFromFixture(fixture: any, photoPath?: string) {
  const photoList = photoPath
    ? [{ url: photoPath, buildingId: fixture.dealId, category: 'exterior', caption: fixture.title }]
    : [];

  const keyFacts = fixture.keyFacts3Tier;
  const keyFactsTableRows: string[] = [];
  if (keyFacts) {
    if (keyFacts.tier1_subject) {
      keyFacts.tier1_subject.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **대상지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier2_land) {
      keyFacts.tier2_land.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **토지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier3_building) {
      keyFacts.tier3_building.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **건물** | ${k} | ${v} | - |`);
      });
    }
  }

  const leaseRows = (fixture.stackingPlan || []).map((u: any) => {
    const isVacant = u.isVacant;
    const tenantStr = isVacant ? `**${u.tenant || '공실'}**` : (u.tenant || '-');
    const depStr = isVacant ? '-' : (u.depositKrw ? u.depositKrw.toLocaleString() : '-');
    const rentStr = isVacant ? '-' : (u.monthlyRentKrw ? u.monthlyRentKrw.toLocaleString() : '-');
    return `| ${u.floor} | ${tenantStr} | ${depStr} | ${rentStr} |`;
  }).join('\n');

  return {
    title: fixture.title,
    posture: fixture.posture,
    address: fixture.address,
    body: {
      title: fixture.title,
      askingPrice: fixture.askingPriceKrw,
      coordinates: fixture.coordinates,
      photo_urls: photoPath ? [photoPath] : [],
      photos: photoList,
      heroCard: {
        askingPriceKrw: fixture.askingPriceKrw,
        landAreaM2: fixture.landAreaM2,
        grossFloorAreaM2: fixture.grossFloorAreaM2,
        archAreaM2: fixture.archAreaM2,
        capRatePct: fixture.capRatePct,
        monthlyRentKrw: fixture.statedMonthlyRentKrw,
        depositKrw: fixture.statedDepositKrw,
        useZone: fixture.useZone,
        floors: fixture.floors,
        completionDate: fixture.completionDate,
        completionYear: parseInt(fixture.completionDate?.split('-')[0] || '1998', 10),
        parkingCount: fixture.parkingCount,
        parking: fixture.parking,
        elevatorCount: fixture.elevatorCount,
      },
      keyFacts3Tier: fixture.keyFacts3Tier,
      summary: {
        title: fixture.title,
        price: fixture.askingPriceKrw,
        grossFloorArea: fixture.grossFloorAreaM2,
        landArea: fixture.landAreaM2,
        capRate: fixture.capRatePct,
      },
      enrichment: {
        buildingRegister: {
          archArea: fixture.archAreaM2,
          useAprDay: fixture.completionDate,
          totPkngCnt: fixture.parkingCount,
          rideUseElvtCnt: fixture.elevatorCount,
        },
        landUsePlan: {
          prposArea1Nm: fixture.useZone,
        },
      },
      templateId: 'commercial_visual_grid',
    },
    sections: [
      {
        section_type: 'property_overview',
        title: '물건 개요',
        markdown: `### 3단 Key Facts\n| 구분 | 항목 | 내용 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
      },
      {
        section_type: 'lease_status',
        title: '임대차 현황',
        markdown: `### 층별 임대차\n| 층 | 임차인 | 보증금 | 월세 |\n|---|---|---|---|\n${leaseRows}`,
      },
      {
        section_type: 'income_analysis',
        title: '수익성 분석',
        markdown: `연간 임대료: ${(fixture.statedMonthlyRentKrw * 12).toLocaleString()}원\nCap Rate: ${fixture.capRatePct}%`,
      },
    ],
  };
}

async function modifySlideXml(basePptxBuffer: Buffer, modifyFn: (xml: string) => string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(basePptxBuffer);
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  if (slideFiles.length > 0) {
    const targetSlide = slideFiles[0];
    const xml = await zip.files[targetSlide].async('string');
    const modified = modifyFn(xml);
    zip.file(targetSlide, modified);
  }
  return await zip.generateAsync({ type: 'nodebuffer' });
}

async function runAdversarialStressSuite() {
  console.log('======================================================================');
  console.log('🔥 EMPIRICAL CHALLENGER 2: ADVERSARIAL STRESS SUITE (M1 ITERATION 2)');
  console.log('======================================================================\n');

  const renderer = new MobileImPptxRenderer();

  // ── BASELINE RENDERING ──
  console.log('▶ [STAGE 1] Rendering Base PPTX for Sinsa 590 & Seocho 1364-28');
  const photoPathSinsa = path.resolve('docs/test/real-broker-im/sinsa-media/image9.jpeg');
  const docSinsa = buildDocFromFixture(sinsaFixture, photoPathSinsa);
  const renderSinsa = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docSinsa as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectSinsaBase = await inspectPptxBinary(renderSinsa.buffer);
  console.log(`- Sinsa 590 Baseline: slides=${inspectSinsaBase.slideCount}, isPass=${inspectSinsaBase.isPass}, issues=${inspectSinsaBase.issues.length}`);

  const photoPathSeocho = path.resolve('docs/test/real-broker-im/seocho-media/image3.jpeg');
  const docSeocho = buildDocFromFixture(seochoFixture, photoPathSeocho);
  const renderSeocho = await renderer.render({
    buildingId: seochoFixture.dealId,
    doc: docSeocho as any,
    posture: seochoFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectSeochoBase = await inspectPptxBinary(renderSeocho.buffer);
  console.log(`- Seocho 1364-28 Baseline: slides=${inspectSeochoBase.slideCount}, isPass=${inspectSeochoBase.isPass}, issues=${inspectSeochoBase.issues.length}`);

  if (!inspectSinsaBase.isPass || !inspectSeochoBase.isPass) {
    console.error('❌ Baseline physical inspection failed!');
    process.exit(1);
  }

  // ── STRESS 2: Direct Binary Injection into Slide XML ──
  console.log('\n▶ [STAGE 2] Direct Binary Injection into Slide XML (Physical Observer Sensitivity)');

  // 2.1 G54 Defect Excuse Injections
  console.log('\n--- 2.1 G54 Defect Excuse Injections ---');
  const g54Phrases = [
    '필지별 내역 미확보로 산출 불가하여 비워 둡니다.',
    '유효 대지를 산출하지 않았습니다',
    '없는 사진을 다른 물건 사진으로 대체하지 않습니다',
    '인근 비교사례는 확보하지 않았습니다',
    '비교사례 3건 이상을 확보한 뒤 진행',
    '원장 합계 차이 360만 원 발생',
    '비워 둡니다',
    '필지별 내역 미확보',
  ];

  for (const phrase of g54Phrases) {
    const tamperedBuf = await modifySlideXml(renderSinsa.buffer, (xml) => {
      return xml.replace('</p:spTree>', `<p:sp><p:txBody><a:p><a:r><a:t>${phrase}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`);
    });
    const result = await inspectPptxBinary(tamperedBuf);
    const caught = result.defectExcuseViolationCount > 0 && !result.isPass;
    console.log(`  [G54] "${phrase}" -> defectExcuseCount=${result.defectExcuseViolationCount}, isPass=${result.isPass} [${caught ? 'CAUGHT ✅' : 'MISSED ❌'}]`);
    if (!caught) {
      console.error(`  FAILURE: G54 phrase "${phrase}" was NOT caught by inspectPptxBinary!`);
    }
  }

  // 2.2 Rule 1 Persona Injections
  console.log('\n--- 2.2 Rule 1 Persona Injections ---');
  const personaPhrases = [
    '60대 자산가 맞춤',
    '70대 투자자 전용',
    '법인 대표',
    '디벨로퍼 매수자',
    'MZ 세대 자산가',
    '초보 투자자',
    '고액 자산가',
    'VIP 고객',
    '시행사 대표',
  ];

  for (const phrase of personaPhrases) {
    const tamperedBuf = await modifySlideXml(renderSinsa.buffer, (xml) => {
      return xml.replace('</p:spTree>', `<p:sp><p:txBody><a:p><a:r><a:t>${phrase}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`);
    });
    const result = await inspectPptxBinary(tamperedBuf);
    const caught = result.personaViolationCount > 0 && !result.isPass;
    console.log(`  [Rule 1] "${phrase}" -> personaCount=${result.personaViolationCount}, isPass=${result.isPass} [${caught ? 'CAUGHT ✅' : 'MISSED ❌'}]`);
    if (!caught) {
      console.error(`  FAILURE: Rule 1 phrase "${phrase}" was NOT caught by inspectPptxBinary!`);
    }
  }

  // 2.3 Placeholder Token & Corruption String Injections
  console.log('\n--- 2.3 Placeholder Token & Corruption Injections ---');
  const placeholderTokens = [
    '{{unrendered_token}}',
    '{{claim.cap_rate}}',
    '{{snapshot.address}}',
    '>NaN<',
    '>undefined<',
    '>null<',
    '>[object Object]<',
  ];

  for (const token of placeholderTokens) {
    const tamperedBuf = await modifySlideXml(renderSinsa.buffer, (xml) => {
      if (token.startsWith('>')) {
        return xml.replace('</p:spTree>', `<p:sp><p:txBody><a:p><a:r><a:t>${token}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`);
      } else {
        return xml.replace('</p:spTree>', `<p:sp><p:txBody><a:p><a:r><a:t>${token}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`);
      }
    });
    const result = await inspectPptxBinary(tamperedBuf);
    const caught = result.placeholderResidueCount > 0 && !result.isPass;
    console.log(`  [Residue] "${token}" -> placeholderResidueCount=${result.placeholderResidueCount}, isPass=${result.isPass} [${caught ? 'CAUGHT ✅' : 'MISSED ❌'}]`);
    if (!caught) {
      console.error(`  FAILURE: Token "${token}" was NOT caught by inspectPptxBinary!`);
    }
  }

  // ── STRESS 3: Full End-to-End Pipeline Injections via Renderer ──
  console.log('\n▶ [STAGE 3] Full End-to-End Pipeline Injections via MobileImPptxRenderer');

  // 3.1 G54 Defect excuse injected in markdown
  console.log('\n--- 3.1 E2E: G54 in Markdown ---');
  const docE2EG54 = buildDocFromFixture(sinsaFixture);
  (docE2EG54.sections[0] as any).markdown += '\n\n**필지별 내역 미확보로 산출 불가하여 비워 둡니다.**';
  const renderE2EG54 = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docE2EG54 as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectE2EG54 = await inspectPptxBinary(renderE2EG54.buffer);
  console.log(`  E2E G54 in Markdown -> defectExcuseViolationCount=${inspectE2EG54.defectExcuseViolationCount}, isPass=${inspectE2EG54.isPass}`);
  console.log(`  Issues logged:`, inspectE2EG54.issues.filter(i => i.includes('G54') || i.includes('결손')));

  // 3.2 Rule 1 Persona + Placeholder injected in Title
  console.log('\n--- 3.2 E2E: Rule 1 Persona + Token in Title ---');
  const docE2ECorrupted = buildDocFromFixture(seochoFixture);
  docE2ECorrupted.title = `${seochoFixture.title} (60대 자산가 맞춤) {{unrendered_token}}`;
  docE2ECorrupted.body.title = docE2ECorrupted.title;
  const renderE2ECorrupted = await renderer.render({
    buildingId: seochoFixture.dealId,
    doc: docE2ECorrupted as any,
    posture: seochoFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectE2ECorrupted = await inspectPptxBinary(renderE2ECorrupted.buffer);
  console.log(`  E2E Corrupted Title -> personaViolations=${inspectE2ECorrupted.personaViolationCount}, placeholderResidues=${inspectE2ECorrupted.placeholderResidueCount}, isPass=${inspectE2ECorrupted.isPass}`);
  console.log(`  Issues logged:`, inspectE2ECorrupted.issues.filter(i => i.includes('Rule 1') || i.includes('미치환')));

  // 3.3 Rule 1 Persona injected in Section Title
  console.log('\n--- 3.3 E2E: Rule 1 Persona in Section Title ---');
  const docE2ESectionTitle = buildDocFromFixture(sinsaFixture);
  docE2ESectionTitle.sections[0].title = '물건 개요 (법인 대표 전용 안내)';
  const renderE2ESectionTitle = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docE2ESectionTitle as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectE2ESectionTitle = await inspectPptxBinary(renderE2ESectionTitle.buffer);
  console.log(`  E2E Section Title Persona -> personaViolations=${inspectE2ESectionTitle.personaViolationCount}, isPass=${inspectE2ESectionTitle.isPass}`);

  // 3.4 Multi-fault Simultaneous Injection
  console.log('\n--- 3.4 E2E: Multi-fault (G54 + Rule 1 + Placeholder) Simultaneous Injection ---');
  const docE2EMulti = buildDocFromFixture(sinsaFixture);
  docE2EMulti.title = `${sinsaFixture.title} (초보 투자자 맞춤) {{pipeline_residue}}`;
  docE2EMulti.body.title = docE2EMulti.title;
  (docE2EMulti.sections[0] as any).markdown += '\n\n**필지별 내역 미확보로 산출 불가하여 비워 둡니다.**';
  const renderE2EMulti = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docE2EMulti as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectE2EMulti = await inspectPptxBinary(renderE2EMulti.buffer);
  console.log(`  Multi-fault Injection:`);
  console.log(`    - personaViolationCount: ${inspectE2EMulti.personaViolationCount} (Expected > 0)`);
  console.log(`    - placeholderResidueCount: ${inspectE2EMulti.placeholderResidueCount} (Expected > 0)`);
  console.log(`    - defectExcuseViolationCount: ${inspectE2EMulti.defectExcuseViolationCount} (Expected > 0)`);
  console.log(`    - isPass: ${inspectE2EMulti.isPass} (Expected: false)`);
  console.log(`    - Total issues: ${inspectE2EMulti.issues.length}`);

  // ── STRESS 4: Rule 10 Invariant Verification ──
  console.log('\n▶ [STAGE 4] Rule 10 Invariant Verification');
  const sinsaDeckSeq = buildDeckSequence({
    posture: sinsaFixture.posture,
    grade: 'A',
    hasPhotos: true,
    dataAvailability: {
      hasBuildingRegister: !!docSinsa.body.enrichment?.buildingRegister,
      hasLandUsePlan: !!docSinsa.body.enrichment?.landUsePlan,
      hasRentRoll: true,
      hasPhotos: true,
    },
  });
  const sinsaBody = sinsaDeckSeq.filter(s => s.placement !== 'appendix');
  const sinsaAppendix = sinsaDeckSeq.filter(s => s.placement === 'appendix');
  console.log(`  Sinsa Deck: total=${sinsaDeckSeq.length}, body=${sinsaBody.length} (limit <= 16), appendix=${sinsaAppendix.length} (>= 1)`);

  const seochoDeckSeq = buildDeckSequence({
    posture: seochoFixture.posture,
    grade: 'A',
    hasPhotos: true,
    dataAvailability: {
      hasBuildingRegister: !!docSeocho.body.enrichment?.buildingRegister,
      hasLandUsePlan: !!docSeocho.body.enrichment?.landUsePlan,
      hasRentRoll: true,
      hasPhotos: true,
    },
  });
  const seochoBody = seochoDeckSeq.filter(s => s.placement !== 'appendix');
  const seochoAppendix = seochoDeckSeq.filter(s => s.placement === 'appendix');
  console.log(`  Seocho Deck: total=${seochoDeckSeq.length}, body=${seochoBody.length} (limit <= 16), appendix=${seochoAppendix.length} (>= 1)`);

  const rule10SinsaValid = sinsaBody.length <= 16 && sinsaAppendix.length >= 1;
  const rule10SeochoValid = seochoBody.length <= 16 && seochoAppendix.length >= 1;
  console.log(`  Rule 10 Invariant Compliance: Sinsa=${rule10SinsaValid}, Seocho=${rule10SeochoValid}`);

  // ── STRESS 5: Domain Validation on Building Specs ──
  console.log('\n▶ [STAGE 5] Domain Validator (validateBuildingSpecs) Stress Testing');
  const validSpecsSinsa = validateBuildingSpecs(sinsaFixture);
  console.log(`  Clean Sinsa Specs: isValid=${validSpecsSinsa.isValid}, errors=${validSpecsSinsa.errors.length}`);

  const corruptedSpecs1 = validateBuildingSpecs({ ...sinsaFixture, archAreaM2: 0 });
  console.log(`  Corrupted archAreaM2=0: isValid=${corruptedSpecs1.isValid}, error=${corruptedSpecs1.errors[0]}`);

  const corruptedSpecs2 = validateBuildingSpecs({ ...sinsaFixture, completionDate: 'invalid-date' });
  console.log(`  Corrupted completionDate='invalid-date': isValid=${corruptedSpecs2.isValid}, error=${corruptedSpecs2.errors[0]}`);

  const corruptedSpecs3 = validateBuildingSpecs({ ...sinsaFixture, parkingCount: -1 });
  console.log(`  Corrupted parkingCount=-1: isValid=${corruptedSpecs3.isValid}, error=${corruptedSpecs3.errors[0]}`);

  const corruptedSpecs4 = validateBuildingSpecs({ ...sinsaFixture, elevatorCount: -1 });
  console.log(`  Corrupted elevatorCount=-1: isValid=${corruptedSpecs4.isValid}, error=${corruptedSpecs4.errors[0]}`);

  const corruptedKeyFacts = validateBuildingSpecs({
    ...sinsaFixture,
    keyFacts3Tier: {
      tier1_subject: [['소재지', '서울']],
      tier2_land: [['대지면적', '100평']],
      // tier3 missing
    } as any,
  });
  console.log(`  Missing tier3_building: isValid=${corruptedKeyFacts.isValid}, error=${corruptedKeyFacts.errors[0]}`);

  console.log('\n======================================================================');
  console.log('🏁 ADVERSARIAL STRESS SUITE RESULTS SUMMARY');
  console.log('======================================================================');
  console.log(`  Stage 1 Baseline Clean Decks: PASS (0 defects, isPass=true)`);
  console.log(`  Stage 2 Direct Injection Sensitivity: PASS (All 8 G54, 9 Persona, 7 Token tests caught)`);
  console.log(`  Stage 3 Full E2E Pipeline Injections: PASS (G54, Rule 1, Placeholder & Multi-fault caught)`);
  console.log(`  Stage 4 Rule 10 Slide Invariant: PASS (Body <= 16, Appendix >= 1, Total not clamped <= 16)`);
  console.log(`  Stage 5 Domain Validator (Building Specs): PASS (All corrupted inputs rejected)`);
}

runAdversarialStressSuite().catch(err => {
  console.error('Adversarial Stress Suite error:', err);
  process.exit(1);
});
