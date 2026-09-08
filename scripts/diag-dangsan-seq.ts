import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { buildDeckSequence } from '../src/domain/building/mobile-im/pptx/deck-sequencer';
import { bindSectionData } from '../src/domain/building/mobile-im/pptx/data-binder';
import { planGallerySlides } from '../src/domain/building/mobile-im/pptx/gallery-planner';
import { resolvePhotos } from '../src/domain/building/mobile-im/photo-url-transformer';

async function main() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: doc } = await c.from('document_objects').select('*').eq('id', '907cfb73-6b64-4dd0-894e-c16209baacc5').single();
  const { data: bld } = await c.from('building_ssot_lite').select('*').eq('id', '272472c8-ba27-4159-bf95-fcd7a326dd56').single();

  const enrichment = doc.body?.enrichment ?? {};
  const externalData = doc.body?.external_data ?? {};
  const da = {
    hasBuildingRegister: !!(enrichment.buildingRegister ?? externalData.hasPublicData),
    hasRegistryData: !!(enrichment.registryData),
    hasComparables: (enrichment.comparableTransactions?.length ?? 0) > 0,
    hasCommercialDistrict: !!(enrichment.commercialDistrict),
    hasCadastralMap: !!(enrichment.cadastralMapImage),
    hasFloorPlan: false,
    hasRentRoll: !!(doc.body?.floor_leases?.length || doc.body?.ssot_summary?.monthly_rent_total_krw),
  };
  console.log('dataAvailability:', JSON.stringify(da, null, 2));

  const resolvedPhotos = resolvePhotos(doc.body, bld?.id || '272472c8-ba27-4159-bf95-fcd7a326dd56');
  console.log('resolvedPhotos count:', resolvedPhotos.length);
  const gallerySpecs = planGallerySlides(resolvedPhotos, 'income');

  console.log('doc.body.releaseTier:', doc.body?.releaseTier);
  console.log('doc.body.dataGrade:', doc.body?.dataGrade);

  const seq = buildDeckSequence({
    posture: 'income',
    grade: 'A',
    incomeArchetype: 'R-INC-01',
    hasPhotos: true,
    gallerySpecs,
    dataAvailability: {
      hasBuildingRegister: true,
      hasLandUsePlan: true,
      hasRegistryData: true,
      hasComparables: true,
      hasCommercialDistrict: true,
      hasCadastralMap: false,
      hasFloorPlan: false,
      hasRentRoll: true,
    },
    releaseTier: 'decision_im',
  });

  console.log('\n--- Sequence specs (' + seq.length + ') ---');
  seq.forEach((s, idx) => console.log(`${idx + 1}. [${s.archetype}] dataKey: ${s.dataKey} | title: ${s.title}`));

  const normalizedDoc = {
    ...doc,
    sections: doc.sections ?? doc.body?.sections ?? [],
  };
  const dataMap = bindSectionData(normalizedDoc, bld, 'commercial_visual_grid');
  console.log('\n--- DataMap keys (' + Object.keys(dataMap).length + ') ---');
  console.log(Object.keys(dataMap));

  console.log('\n--- Checking suppression for each slide ---');
  for (const s of seq) {
    const slideData = dataMap[s.dataKey];
    const isStatic = ['cover', 'closing', 'gallery', 'summary'].includes(s.dataKey) || s.dataKey.startsWith('gallery_') || s.archetype === 'A14';
    const hasContent = slideData && (
      (slideData.content && slideData.content.trim().length > 0) ||
      (slideData.tables && slideData.tables.length > 0) ||
      ((slideData as any).left?.rows?.length > 0 || (slideData as any).left?.sub) ||
      ((slideData as any).right?.stats?.length > 0 || (slideData as any).right?.callouts?.length > 0 || (slideData as any).right?.rows?.length > 0) ||
      ((slideData as any).blocks?.length > 0) ||
      ((slideData as any).table1?.rows?.length > 0) ||
      ((slideData as any).steps?.length > 0) ||
      (Boolean((slideData as any).markdown && (slideData as any).markdown.trim().length > 0))
    );
    console.log(`  ${s.dataKey} (${s.archetype}: ${s.title}): exists=${!!slideData}, hasContent=${!!hasContent}, isStatic=${isStatic} -> RENDER=${hasContent || isStatic}`);
  }
}
main();
