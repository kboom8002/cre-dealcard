import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';
import { validateBrokerInput, type BrokerPropertyInput } from '../src/domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../src/domain/building/im-core/cross-channel-checker';
import { computeTargetHash } from '../src/domain/building/im-core/target-hash';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';

const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

function fixtureToBrokerInput(fixture: any, options?: { overrideLandPrice?: number; photoUrls?: string[] }): BrokerPropertyInput {
  const units = (fixture.stackingPlan || []).map((s: any) => ({
    floor: s.floor,
    tenant: s.tenant,
    deposit: s.depositKrw,
    rent: s.monthlyRentKrw,
    areaPyeong: s.floorAreaPy,
    isVacant: s.isVacant,
  }));
  return {
    askingPriceKrw: fixture.askingPriceKrw,
    landAreaM2: fixture.landAreaM2,
    grossFloorAreaM2: fixture.grossFloorAreaM2,
    statedLandPricePerPyeongKrw: options?.overrideLandPrice ?? fixture.statedLandPricePerPyeongKrw,
    statedDepositKrw: fixture.statedDepositKrw,
    statedMonthlyRentKrw: fixture.statedMonthlyRentKrw,
    rentRoll: {
      totalUnits: units.length,
      units,
    },
    photoUrls: options?.photoUrls ?? (fixture.photos || []).map((p: any) => p.url),
  };
}

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
        leadText: `${fixture.title} 핵심 투자 요약`,
        narrative: fixture.proForma?.narrative || `매각희망가 ${(fixture.askingPriceKrw / 1e8).toLocaleString()}억 원`,
      },
      enrichment: {
        buildingRegister: {
          totalArea: fixture.grossFloorAreaM2,
          platArea: fixture.landAreaM2,
          archArea: fixture.archAreaM2,
          bcRat: fixture.bcRat,
          vlRat: fixture.vlRat,
          floorsAbove: fixture.floorsAbove || 6,
          floorsBelow: fixture.floorsBelow || 1,
          structure: fixture.structure,
          mainPurpose: '제1종·제2종 근린생활시설',
          elevatorCount: fixture.elevatorCount,
          parkingCount: fixture.parkingCount,
          useAprDay: fixture.completionDate?.replace(/-/g, ''),
          approvalDate: fixture.completionDate,
        },
        landUsePlan: {
          zoningDistrict: fixture.useZone,
          buildingCoverageMax: fixture.bcRat ? Math.ceil(fixture.bcRat) : 50,
          floorAreaRatioMax: fixture.maxVlRat || 250,
        },
      },
      ssot_summary: {
        title: fixture.title,
        asking_price: fixture.askingPriceKrw,
        total_area: fixture.grossFloorAreaM2,
        land_area: fixture.landAreaM2,
        cap_rate: fixture.capRatePct,
        total_deposit: fixture.statedDepositKrw,
        monthly_rent: fixture.statedMonthlyRentKrw,
      },
    },
    sections: [
      {
        section_type: 'property_overview',
        title: '토지 및 건물 제원',
        markdown: `### 건축물대장 및 3단 그룹 Key Facts 제원\n\n| 구분 | 주요 항목 | 상세 제원 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
      },
      {
        section_type: 'lease_status',
        title: '임대차 현황 (Rent Roll)',
        markdown: `| 층수 | 입주사명 | 보증금(원) | 월차임(원) |\n|---|---|---:|---:|\n${leaseRows}\n| **합계** | **총 ${fixture.stackingPlan?.length || 0}개 구획** | **${fixture.statedDepositKrw.toLocaleString()}** | **${fixture.statedMonthlyRentKrw.toLocaleString()}** |`,
      },
      {
        section_type: 'income_analysis',
        title: '수익성 및 현금흐름 분석',
        markdown: `### 연 순수익률 (Cap Rate) 분석\n- 현재 연 순수익률 (Cap Rate): ${fixture.capRatePct}%\n- 연간 임대수익: ${((fixture.statedMonthlyRentKrw * 12) / 1e8).toFixed(2)}억 원`,
      },
    ],
  };
}

async function runAdversarialSuite() {
  console.log('======================================================================');
  console.log('🧪 EMPIRICAL CHALLENGER 2: ADVERSARIAL STRESS TEST SUITE');
  console.log('======================================================================\n');

  // ── TEST 1: Inspect Physical Binaries of Both Properties ──
  console.log('▶ [STRESS-1] Physical Inspection of Rendered PPTX Binaries in docs/demo-output');
  const sinsaPptxPath = path.resolve('docs/demo-output/real-broker-sinsa-590.pptx');
  const seochoPptxPath = path.resolve('docs/demo-output/real-broker-seocho-1364.pptx');

  if (fs.existsSync(sinsaPptxPath) && fs.existsSync(seochoPptxPath)) {
    const sinsaBuf = fs.readFileSync(sinsaPptxPath);
    const seochoBuf = fs.readFileSync(seochoPptxPath);

    const sinsaInspection = await inspectPptxBinary(sinsaBuf);
    const seochoInspection = await inspectPptxBinary(seochoBuf);

    console.log(`- Sinsa 590: isPass=${sinsaInspection.isPass}, slides=${sinsaInspection.slideCount}, bleed=${sinsaInspection.bleedCount}, residue=${sinsaInspection.placeholderResidueCount}, brokenImg=${sinsaInspection.brokenImageCount}, persona=${sinsaInspection.personaViolationCount}, lexicon=${sinsaInspection.lexiconViolationCount}, legal=${sinsaInspection.legalRiskViolationCount}, G54=${sinsaInspection.defectExcuseViolationCount}, G55=${sinsaInspection.preachyViolationCount}, G56=${sinsaInspection.internalRuleViolationCount}, issues=${sinsaInspection.issues.length}`);
    console.log(`- Seocho 1364: isPass=${seochoInspection.isPass}, slides=${seochoInspection.slideCount}, bleed=${seochoInspection.bleedCount}, residue=${seochoInspection.placeholderResidueCount}, brokenImg=${seochoInspection.brokenImageCount}, persona=${seochoInspection.personaViolationCount}, lexicon=${seochoInspection.lexiconViolationCount}, legal=${seochoInspection.legalRiskViolationCount}, G54=${seochoInspection.defectExcuseViolationCount}, G55=${seochoInspection.preachyViolationCount}, G56=${seochoInspection.internalRuleViolationCount}, issues=${seochoInspection.issues.length}`);
  } else {
    console.warn('One or both PPTX binaries not found in docs/demo-output!');
  }

  // ── TEST 2: Adversarial Injection of Prohibited Content into inspectPptxBinary ──
  console.log('\n▶ [STRESS-2] Adversarial Injection: Testing Sensitivity of inspectPptxBinary to Violations');
  const renderer = new MobileImPptxRenderer();

  // Inject persona violation into doc
  const docWithPersona = buildDocFromFixture(sinsaFixture);
  (docWithPersona.sections[0] as any).markdown += '\n\n**60대 자산가를 위한 맞춤형 우량 자산**';
  const renderPersona = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docWithPersona as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectPersona = await inspectPptxBinary(renderPersona.buffer);
  console.log(`- Injected Persona: caught=${inspectPersona.personaViolationCount > 0}, count=${inspectPersona.personaViolationCount}, isPass=${inspectPersona.isPass}`);

  // Inject lexicon violation into doc
  const docWithLexicon = buildDocFromFixture(sinsaFixture);
  (docWithLexicon.sections[0] as any).markdown += '\n\n**본 건물의 캡레이트는 우수합니다.**';
  const renderLexicon = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docWithLexicon as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectLexicon = await inspectPptxBinary(renderLexicon.buffer);
  console.log(`- Injected Lexicon: caught=${inspectLexicon.lexiconViolationCount > 0}, count=${inspectLexicon.lexiconViolationCount}, isPass=${inspectLexicon.isPass}`);

  // Inject legal risk into doc
  const docWithLegal = buildDocFromFixture(sinsaFixture);
  (docWithLegal.sections[0] as any).markdown += '\n\n**연 6% 수익률 확정 보장 물건**';
  const renderLegal = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docWithLegal as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectLegal = await inspectPptxBinary(renderLegal.buffer);
  console.log(`- Injected Legal Risk: caught=${inspectLegal.legalRiskViolationCount > 0}, count=${inspectLegal.legalRiskViolationCount}, isPass=${inspectLegal.isPass}`);

  // Inject defect excuse (G54) into doc
  const docWithG54 = buildDocFromFixture(sinsaFixture);
  (docWithG54.sections[0] as any).markdown += '\n\n**필지별 내역 미확보로 산출 불가하여 비워 둡니다.**';
  const renderG54 = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: docWithG54 as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const inspectG54 = await inspectPptxBinary(renderG54.buffer);
  console.log(`- Injected G54 Defect Excuse: caught=${inspectG54.defectExcuseViolationCount > 0}, count=${inspectG54.defectExcuseViolationCount}, isPass=${inspectG54.isPass}`);

  // ── TEST 3: Tampered Inputs in Broker Input Validator ──
  console.log('\n▶ [STRESS-3] Tampered Inputs: Broker Input Validator Anomaly Sensitivity');
  
  // 3.1 Land Price Tampering
  const normalSinsaInput = fixtureToBrokerInput(sinsaFixture);
  const normalSinsaRes = validateBrokerInput(normalSinsaInput);
  console.log(`- Baseline Clean Sinsa: isValid=${normalSinsaRes.isValid}, hasCritical=${normalSinsaRes.hasCritical}, discCount=${normalSinsaRes.discrepancies.length}`);

  // Tamper: +10% deviation (should be within tolerance or warning)
  const tamper10Sinsa = fixtureToBrokerInput(sinsaFixture, { overrideLandPrice: sinsaFixture.statedLandPricePerPyeongKrw * 1.10 });
  const tamper10Res = validateBrokerInput(tamper10Sinsa);
  console.log(`- Tamper +10% Land Price: isValid=${tamper10Res.isValid}, hasCritical=${tamper10Res.hasCritical}, discCount=${tamper10Res.discrepancies.length}`);

  // Tamper: +25% deviation (exceeds 20% critical threshold)
  const tamper25Sinsa = fixtureToBrokerInput(sinsaFixture, { overrideLandPrice: sinsaFixture.statedLandPricePerPyeongKrw * 1.25 });
  const tamper25Res = validateBrokerInput(tamper25Sinsa);
  const crit25 = tamper25Res.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
  console.log(`- Tamper +25% Land Price: isValid=${tamper25Res.isValid}, hasCritical=${tamper25Res.hasCritical}, discCode=${crit25?.code}, severity=${crit25?.severity}, discPct=${crit25?.discrepancyPct?.toFixed(1)}%`);

  // Tamper: -30% deviation
  const tamperMinus30Sinsa = fixtureToBrokerInput(sinsaFixture, { overrideLandPrice: sinsaFixture.statedLandPricePerPyeongKrw * 0.70 });
  const tamperMinus30Res = validateBrokerInput(tamperMinus30Sinsa);
  const critMinus30 = tamperMinus30Res.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
  console.log(`- Tamper -30% Land Price: isValid=${tamperMinus30Res.isValid}, hasCritical=${tamperMinus30Res.hasCritical}, discCode=${critMinus30?.code}, severity=${critMinus30?.severity}, discPct=${critMinus30?.discrepancyPct?.toFixed(1)}%`);

  // ── TEST 4: Cross Channel Tamper Sensitivity ──
  console.log('\n▶ [STRESS-4] Tampered Core Metrics in Cross Channel Checker');
  const baseWebDoc = {
    title: sinsaFixture.title,
    body: {
      askingPrice: sinsaFixture.askingPriceKrw,
      ssot_summary: {
        title: sinsaFixture.title,
        asking_price: sinsaFixture.askingPriceKrw,
        total_area: sinsaFixture.grossFloorAreaM2,
        land_area: sinsaFixture.landAreaM2,
        cap_rate: sinsaFixture.capRatePct,
        total_deposit: sinsaFixture.statedDepositKrw,
        monthly_rent: sinsaFixture.statedMonthlyRentKrw,
      },
    },
  };

  const baseProject = {
    title: sinsaFixture.title,
    slides: [
      {
        layoutType: 'A02',
        dataKey: 'overview',
        slideOverrides: { price: sinsaFixture.askingPriceKrw },
      },
    ],
  };

  // 4.1 Price Tampering: 760억 -> 759억 (0.13% difference, exceeds 0.1% threshold)
  const tamperedPriceDoc = JSON.parse(JSON.stringify(baseWebDoc));
  tamperedPriceDoc.body.askingPrice = 75900000000;
  tamperedPriceDoc.body.ssot_summary.asking_price = 75900000000;
  const crossPriceRes = verifyCrossChannelConsistency({ webDoc: tamperedPriceDoc, pptxProject: baseProject });
  console.log(`- Tamper Asking Price (760억 vs 759억): passed=${crossPriceRes.passed}, discrepancies=${crossPriceRes.totalDiscrepancies}, field=${crossPriceRes.discrepancies[0]?.field}`);

  // 4.2 Area Tampering: total_area diff > 0.05 m2
  const tamperedAreaDoc = JSON.parse(JSON.stringify(baseWebDoc));
  tamperedAreaDoc.body.ssot_summary.total_area = sinsaFixture.grossFloorAreaM2 + 1.0;
  const projectWithArea = {
    ...baseProject,
    slides: [
      ...baseProject.slides,
      { layoutType: 'A04', dataKey: 'building', slideOverrides: { totalGrossAreaSqm: sinsaFixture.grossFloorAreaM2 } },
    ],
  };
  const crossAreaRes = verifyCrossChannelConsistency({ webDoc: tamperedAreaDoc, pptxProject: projectWithArea });
  console.log(`- Tamper Gross Floor Area (+1.0 m2): passed=${crossAreaRes.passed}, discrepancies=${crossAreaRes.totalDiscrepancies}, field=${crossAreaRes.discrepancies[0]?.field}`);

  // 4.3 Target Hash Invalidation on Data Tampering
  const hash1 = computeTargetHash({ body: baseWebDoc.body, releaseTier: 'analysis_im', policyVersion: 'v1.0.0' });
  const hash2 = computeTargetHash({ body: tamperedPriceDoc.body, releaseTier: 'analysis_im', policyVersion: 'v1.0.0' });
  console.log(`- Target Hash Change on Price Tamper: hashMatches=${hash1 === hash2} (Expected: false)`);

  // ── TEST 5: Stress-testing Missing Specs & Corrupted KeyFacts Behavior ──
  console.log('\n▶ [STRESS-5] Pipeline Behavior on Missing 4 Specs and Corrupted Key Facts');
  // Examine whether the renderer or parser throws or creates corrupted slides when 4 specs are missing
  const missingSpecsDoc = buildDocFromFixture({
    ...sinsaFixture,
    archAreaM2: undefined,
    completionDate: undefined,
    parkingCount: undefined,
    elevatorCount: undefined,
    parking: undefined,
    keyFacts3Tier: undefined, // completely missing 3-tier key facts
  });

  try {
    const missingSpecsRender = await renderer.render({
      buildingId: 'tampered-deal',
      doc: missingSpecsDoc as any,
      posture: sinsaFixture.posture,
      preset: 'commercial_visual_grid',
      grade: 'A',
    });
    const missingSpecsInspection = await inspectPptxBinary(missingSpecsRender.buffer);
    console.log(`- Render with Missing 4 Specs & Missing KeyFacts: succeeded, slides=${missingSpecsInspection.slideCount}, placeholderResidue=${missingSpecsInspection.placeholderResidueCount}, isPass=${missingSpecsInspection.isPass}`);
    if (missingSpecsInspection.placeholderResidueCount > 0) {
      console.log(`  * Residues caught:`, missingSpecsInspection.issues);
    }
  } catch (err: any) {
    console.log(`- Render with Missing 4 Specs & Missing KeyFacts threw error: ${err.message}`);
  }

  console.log('\n======================================================================');
  console.log('🏁 ADVERSARIAL STRESS TEST SUITE COMPLETE');
  console.log('======================================================================');
}

runAdversarialSuite().catch(console.error);
