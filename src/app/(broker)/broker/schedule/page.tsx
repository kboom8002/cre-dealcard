import React from 'react';
import { BrokerScheduleClient } from './BrokerScheduleClient';
import { createServiceClient } from '@/lib/supabase/service';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';

export default async function BrokerSchedulePage(props: { searchParams: Promise<{ buildingId?: string, setup?: string }> }) {
  const searchParams = await props.searchParams;
  const buildingId = searchParams.buildingId;
  const isSetup = searchParams.setup === 'true';

  const supabase = createServiceClient();
  
  // Fetch broker's buildings for the slot creation dropdown
  const { data: buildings } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type');

  return (
    <main className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-24">
      <div className="flex-1 w-full max-w-md mx-auto bg-white dark:bg-black border-x border-border shadow-sm min-h-screen relative">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold text-lg">임장 일정 관리</h1>
        </header>

        <BrokerScheduleClient 
          initialBuildingId={buildingId} 
          isSetup={isSetup} 
          buildings={buildings || []} 
        />
      </div>
      <BrokerBottomNav />
    </main>
  );
}
