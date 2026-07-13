'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Plus, Clock, MapPin, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Building {
  id: string;
  area_signal: string;
  asset_type: string;
}

interface BrokerScheduleClientProps {
  initialBuildingId?: string;
  isSetup?: boolean;
  buildings: Building[];
}

export function BrokerScheduleClient({ initialBuildingId, isSetup, buildings }: BrokerScheduleClientProps) {
  const supabase = createClient();
  const [slots, setSlots] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Slot Modal State
  const [showModal, setShowModal] = useState(isSetup || false);
  const [selectedBuilding, setSelectedBuilding] = useState(initialBuildingId || '');
  const [slotDate, setSlotDate] = useState(new Date().toISOString().split('T')[0]);
  const [slotTime, setSlotTime] = useState('14:00');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: s } = await supabase
      .from('availability_slots')
      .select('*, building:building_ssot_lite(id, area_signal)')
      .eq('owner_id', user.id)
      .order('slot_start', { ascending: true });
    
    setSlots(s || []);

    if (s && s.length > 0) {
      const slotIds = s.map((x) => x.id);
      const { data: b } = await supabase
        .from('bookings')
        .select('*, requester:profiles!bookings_requester_id_fkey(full_name, phone_number)')
        .in('slot_id', slotIds)
        .order('created_at', { ascending: false });
      setBookings(b || []);
    } else {
      setBookings([]);
    }
    
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateSlot = async () => {
    if (!selectedBuilding || !slotDate || !slotTime) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const startDateTime = new Date(`${slotDate}T${slotTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour slot

    const { error } = await supabase.from('availability_slots').insert({
      owner_id: user.id,
      building_id: selectedBuilding,
      slot_date: slotDate,
      slot_start: startDateTime.toISOString(),
      slot_end: endDateTime.toISOString(),
      slot_type: 'site_tour',
      status: 'available',
    });

    setCreating(false);
    if (!error) {
      setShowModal(false);
      fetchData();
    } else {
      alert('슬롯 생성 중 오류가 발생했습니다.');
    }
  };

  const activeBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'hold');
  const availableSlots = slots.filter(s => s.status === 'available');

  return (
    <div className="p-4 space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center">
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5">예약 확정/대기</p>
          <p className="text-3xl font-black text-foreground">{activeBookings.length}</p>
        </div>
        <div
          className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all active:scale-[0.98]"
          onClick={() => setShowModal(true)}
        >
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">오픈된 슬롯</p>
          <p className="text-3xl font-black text-foreground">{availableSlots.length}</p>
          <div className="mt-2 text-[10px] bg-emerald-500 text-white px-3 py-1 rounded-full font-bold flex items-center gap-1">
            <Plus className="w-3 h-3" /> 슬롯 추가
          </div>
        </div>
      </div>

      {/* Bookings List */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <User className="w-4 h-4 text-primary" /> 예약 내역
        </h2>
        {activeBookings.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground">예약 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeBookings.map((b) => {
              const slot = slots.find(s => s.id === b.slot_id);
              if (!slot) return null;
              const date = new Date(slot.slot_start);
              return (
                <div key={b.id} className="bg-card border border-border rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                      b.status === 'confirmed'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    }`}>
                      {b.status === 'confirmed' ? '확정' : '대기중'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                    <MapPin className="w-3.5 h-3.5 text-primary" /> {slot.building?.area_signal || '건물 미지정'} 임장
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <User className="w-3 h-3" /> 매수자: {b.requester?.full_name || '고객'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Slots List */}
      <section className="space-y-3 pb-8">
        <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Calendar className="w-4 h-4 text-emerald-500" /> 오픈된 가용 슬롯
        </h2>
        {availableSlots.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-muted flex items-center justify-center">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">오픈된 슬롯이 없습니다</p>
              <p className="text-xs text-muted-foreground">매수자가 예약할 수 있도록 슬롯을 열어주세요.</p>
            </div>
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              슬롯 추가하기
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {availableSlots.map((s) => {
              const date = new Date(s.slot_start);
              return (
                <div key={s.id} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3 hover:border-primary/30 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.building?.area_signal || '건물 미지정'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                    오픈
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl p-5 shadow-2xl relative border border-border">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold mb-5 text-foreground">새로운 임장 슬롯 오픈</h2>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">대상 매물</label>
                <select 
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  value={selectedBuilding}
                  onChange={e => setSelectedBuilding(e.target.value)}
                >
                  <option value="" disabled>매물을 선택하세요</option>
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>{b.area_signal} {b.asset_type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">날짜</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    value={slotDate}
                    onChange={e => setSlotDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">시간</label>
                  <input 
                    type="time" 
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    value={slotTime}
                    onChange={e => setSlotTime(e.target.value)}
                  />
                </div>
              </div>

              <Button 
                className="w-full mt-2" 
                size="lg" 
                onClick={handleCreateSlot}
                disabled={creating || !selectedBuilding}
              >
                {creating ? '오픈 중...' : '슬롯 오픈하기'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
