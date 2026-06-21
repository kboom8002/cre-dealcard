import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch confirmed bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, status, 
      slot:availability_slots(
        slot_start, slot_end, 
        building:building_ssot_lite(area_signal)
      ),
      requester:profiles!bookings_requester_id_fkey(full_name, phone_number)
    `)
    .in('status', ['confirmed', 'hold'])
    .order('created_at', { ascending: false });

  if (!bookings) {
    return new NextResponse("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR", {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' }
    });
  }

  // Generate ICS content
  let icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRE DealCard//Broker Schedule//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  bookings.forEach((b: any) => {
    if (!b.slot) return;
    const start = new Date(b.slot.slot_start).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(b.slot.slot_end).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const buildingName = b.slot.building?.area_signal || '건물 미지정';
    const clientName = b.requester?.full_name || '고객';
    
    icsLines.push("BEGIN:VEVENT");
    icsLines.push(`UID:${b.id}@credeal.net`);
    icsLines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}`);
    icsLines.push(`DTSTART:${start}`);
    icsLines.push(`DTEND:${end}`);
    icsLines.push(`SUMMARY:[${b.status === 'confirmed' ? '확정' : '가승인'}] ${buildingName} 임장 - ${clientName}`);
    icsLines.push(`DESCRIPTION:고객: ${clientName} 연락처: ${b.requester?.phone_number || '없음'}`);
    icsLines.push("STATUS:CONFIRMED");
    icsLines.push("END:VEVENT");
  });

  icsLines.push("END:VCALENDAR");

  return new NextResponse(icsLines.join("\r\n"), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="schedule.ics"'
    }
  });
}
