import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod/v4";

const UpdateSchema = z.object({
  contact_type: z.string().optional(),
  summary: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { id, contactId } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const json = await req.json();
    const updateData = UpdateSchema.parse(json);

    const serviceClient = createServiceClient();

    const { error } = await serviceClient
      .from("contact_history")
      .update(updateData)
      .eq("id", contactId)
      .eq("client_id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { id, contactId } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const serviceClient = createServiceClient();

    const { error } = await serviceClient
      .from("contact_history")
      .delete()
      .eq("id", contactId)
      .eq("client_id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
