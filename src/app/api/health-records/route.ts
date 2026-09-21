import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getDriveImageUrl } from '@/lib/gasDrive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health-records  -> list (Supabase health_records)
 * POST /api/health-records -> create (upload image to Drive via GAS, then insert health_records)
 *   body: { id_card, fullname, weight, bmi, step_count, imageBase64?, filename?, mimeType? }
 *         หรือ { ... , fileId } ถ้าอัปโหลดแยกมาแล้ว
 * DELETE /api/health-records?id=123 -> delete row + delete Drive file
 */

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = getSupabase()!;
  const { data, error } = await sb.from('health_records').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // เติม cdn url ให้ frontend ใช้ทันที
  const rows = (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    image_url: r.image_drive_id ? getDriveImageUrl(String(r.image_drive_id)) : null,
  }));
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id_card = String(body.id_card || '').trim() || null;
  const fullname = String(body.fullname || '').trim() || null;
  const weight = body.weight != null && String(body.weight).trim() !== '' ? Number(body.weight) : null;
  const bmi = body.bmi != null && String(body.bmi).trim() !== '' ? Number(body.bmi) : null;
  const step_count = body.step_count != null && String(body.step_count).trim() !== '' ? Number(body.step_count) : null;

  let image_drive_id: string | null = null;

  // รับ fileId โดยตรง (กรณีอัปโหลดแยกแล้ว)
  if (body.image_drive_id) {
    image_drive_id = String(body.image_drive_id).trim() || null;
  } else if (body.fileId) {
    image_drive_id = String(body.fileId).trim() || null;
  }

  // ถ้ามี imageBase64 ให้อัปโหลดไป GAS ก่อน (ตาม TASK 3 ขั้น 1-3)
  const imageBase64 = body.imageBase64 ? String(body.imageBase64).trim() : body.base64 ? String(body.base64).trim() : '';
  if (!image_drive_id && imageBase64) {
    const filename = String(body.filename || `health_${Date.now()}.jpg`);
    const mimeType = String(body.mimeType || 'image/jpeg');
    // base64 อาจมาเป็น dataURL -> ตัด prefix
    const pureB64 = imageBase64.includes(',') ? imageBase64.split(',').pop()! : imageBase64;
    try {
      const { uploadToDriveViaGas } = await import('@/lib/gasDrive');
      const { fileId } = await uploadToDriveViaGas({ filename, mimeType, base64: pureB64 });
      image_drive_id = fileId;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from('health_records')
    .insert({
      id_card,
      fullname,
      weight,
      bmi,
      step_count,
      image_drive_id,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    {
      ...data,
      image_url: image_drive_id ? getDriveImageUrl(image_drive_id) : null,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required (?id=)' }, { status: 400 });

  const sb = getSupabase()!;
  // ดึง fileId ก่อนลบ
  const { data: row } = await sb.from('health_records').select('image_drive_id').eq('id', Number(id)).maybeSingle();
  const fileId = (row as { image_drive_id: string } | null)?.image_drive_id || null;

  // ลบไฟล์บน Drive ก่อน (best-effort)
  if (fileId) {
    try {
      const { deleteFromDriveViaGas } = await import('@/lib/gasDrive');
      await deleteFromDriveViaGas(String(fileId));
    } catch (e) {
      console.warn('[health-records] GAS delete warn', e);
    }
    // ลองลบจาก Supabase Storage ด้วย (ถ้าเคยใช้)
    try {
      await sb.storage.from('health-images').remove([String(fileId)]);
    } catch {}
  }

  const { error } = await sb.from('health_records').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
