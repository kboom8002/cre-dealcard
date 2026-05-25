/**
 * GET  /api/broker/profile  — 내 브로커 프로필 조회
 * PUT  /api/broker/profile  — 내 브로커 프로필 수정
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(2).max(30).optional(),
  phone: z.string().max(20).optional(),
  company: z.string().max(50).optional(),
  specialty_regions: z.array(z.string()).max(10).optional(),
  specialty_assets: z.array(z.string()).max(10).optional(),
  bio: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, display_name, phone, company, created_at')
    .eq('id', user!.id)
    .single();

  const { data: brokerProfile } = await supabase
    .from('broker_profiles')
    .select('specialty_regions, specialty_assets, bio, is_verified, created_at')
    .eq('user_id', user!.id)
    .single();

  return NextResponse.json({
    ok: true,
    data: {
      ...profile,
      broker: brokerProfile ?? null,
      email: user!.email,
    },
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const json = await req.json();
  const parsed = ProfileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { display_name, phone, company, specialty_regions, specialty_assets, bio } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Update profiles table
  const profileUpdate: Record<string, unknown> = {};
  if (display_name !== undefined) profileUpdate.display_name = display_name;
  if (phone !== undefined) profileUpdate.phone = phone;
  if (company !== undefined) profileUpdate.company = company;

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user!.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upsert broker_profiles table
  const brokerUpdate: Record<string, unknown> = { user_id: user!.id };
  if (specialty_regions !== undefined) brokerUpdate.specialty_regions = specialty_regions;
  if (specialty_assets !== undefined) brokerUpdate.specialty_assets = specialty_assets;
  if (bio !== undefined) brokerUpdate.bio = bio;

  if (Object.keys(brokerUpdate).length > 1) {
    const { error } = await supabase
      .from('broker_profiles')
      .upsert(brokerUpdate, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
