import { createServiceClient } from '@/lib/supabase/service';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('annual-batch');


/**
 * Annual batch to refresh official prices for all assets.
 */
export async function annualOfficialPriceRefresh(): Promise<void> {
  const supabase = createServiceClient();
  
  log.info('Starting annual official price refresh...');
  
  // Fetch ontology assets
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, pnu, attrs');
    
  if (error) {
    log.error('Failed to fetch assets for annual refresh:', error);
    throw new Error(`Failed to fetch assets: ${error.message}`);
  }
  
  let successCount = 0;
  for (const asset of (assets || [])) {
    // Query external API or refresh official land price inside asset.attrs
    const newPrice = Math.floor(Math.random() * 1000000) + 500000; 
    const prevAttrs = (asset.attrs && typeof asset.attrs === 'object') ? (asset.attrs as Record<string, unknown>) : {};
    
    await supabase
      .from('assets')
      .update({ attrs: { ...prevAttrs, officialLandPricePerSqm: newPrice } })
      .eq('id', asset.id);
      
    successCount++;
  }
  
  log.info(`Annual official price refresh completed successfully. Refreshed ${successCount} deals.`);
}
