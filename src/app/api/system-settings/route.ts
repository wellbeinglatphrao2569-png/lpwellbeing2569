import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEFAULT_SETTINGS, DEV_SECRET_SERVER, SETTINGS_SINGLETON_ID } from '@/lib/maintenance';
import type { SystemSettings } from '@/lib/maintenance';

// Fallback store เมื่อไม่มี Supabase — เก็บใน memory + file (ถ้าทำได้)
// ใช้ global เพื่อคงค่าใน dev hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __lp_system_settings: SystemSettings | undefined;
}
function getFallback(): SystemSettings {
  if (!globalThis.__lp_system_settings) {
    globalThis.__lp_system_settings = { ...DEFAULT_SETTINGS };
  }
  return globalThis.__lp_system_settings!;
}
function setFallback(s: SystemSettings) {
  globalThis.__lp_system_settings = { ...s, updated_at: new Date().toISOString() };
  // พยายามเขียนลงไฟล์ data/system_settings.json เพื่อคงค่าระหว่าง restart (best-effort)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const p = path.join(process.cwd(), 'data', 'system_settings.json');
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(globalThis.__lp_system_settings, null, 2), 'utf-8');
  } catch {}
}
function loadFallbackFromFile() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const p = path.join(process.cwd(), 'data', 'system_settings.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (j && typeof j.is_maintenance_active === 'boolean') {
        globalThis.__lp_system_settings = {
          is_maintenance_active: !!j.is_maintenance_active,
          maintenance_title: String(j.maintenance_title || DEFAULT_SETTINGS.maintenance_title),
          maintenance_message: String(j.maintenance_message || DEFAULT_SETTINGS.maintenance_message),
          updated_at: j.updated_at,
          updated_by: j.updated_by,
        };
      }
    }
  } catch {}
}
loadFallbackFromFile();

export const dynamic = 'force-dynamic';

export async function GET() {
  // Supabase path
  if (isSupabaseConfigured()) {
    const sb = getSupabase()!;
    try {
      const { data, error } = await sb
        .from('system_settings')
        .select('is_maintenance_active, maintenance_title, maintenance_message, updated_at, updated_by')
        .eq('id', SETTINGS_SINGLETON_ID)
        .maybeSingle();
      if (error) {
        // ถ้าตารางยังไม่มี -> fallback
        console.warn('[system-settings] supabase error, fallback:', error.message);
        return NextResponse.json(getFallback(), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (!data) {
        // สร้างแถวเริ่มต้น
        const init = { id: SETTINGS_SINGLETON_ID, ...DEFAULT_SETTINGS };
        await sb.from('system_settings').upsert(init, { onConflict: 'id' });
        return NextResponse.json(DEFAULT_SETTINGS, { headers: { 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json(
        {
          is_maintenance_active: !!data.is_maintenance_active,
          maintenance_title: data.maintenance_title ?? DEFAULT_SETTINGS.maintenance_title,
          maintenance_message: data.maintenance_message ?? DEFAULT_SETTINGS.maintenance_message,
          updated_at: data.updated_at,
          updated_by: data.updated_by,
        } satisfies SystemSettings,
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (e) {
      console.warn('[system-settings] exception', e);
      return NextResponse.json(getFallback(), { headers: { 'Cache-Control': 'no-store' } });
    }
  }
  // Fallback
  return NextResponse.json(getFallback(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  // ตรวจ dev_secret แบบเบา (ถ้าส่งมา) — ถ้าไม่ส่งก็อนุญาต (panel ใช้ localStorage bypass เป็นหลัก)
  // แต่ถ้าส่ง _dev_secret มาต้องตรง
  const devSecret = String((body as Record<string, unknown>)._dev_secret || req.headers.get('x-dev-secret') || '');
  if (devSecret && devSecret !== DEV_SECRET_SERVER) {
    return NextResponse.json({ success: false, message: 'dev_secret ไม่ถูกต้อง' }, { status: 403 });
  }

  const isActive = body.is_maintenance_active;
  const title = body.maintenance_title;
  const message = body.maintenance_message;
  const updatedBy = (body.updated_by as string) || null;

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ success: false, message: 'is_maintenance_active ต้องเป็น boolean' }, { status: 400 });
  }
  const cleanTitle = String(title ?? '').trim() || DEFAULT_SETTINGS.maintenance_title;
  const cleanMessage = String(message ?? '').trim() || DEFAULT_SETTINGS.maintenance_message;
  if (cleanTitle.length > 200) return NextResponse.json({ success: false, message: 'หัวข้อยาวเกิน 200 ตัวอักษร' }, { status: 400 });
  if (cleanMessage.length > 1000) return NextResponse.json({ success: false, message: 'ข้อความยาวเกิน 1000 ตัวอักษร' }, { status: 400 });

  const next: SystemSettings = {
    is_maintenance_active: isActive,
    maintenance_title: cleanTitle,
    maintenance_message: cleanMessage,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  if (isSupabaseConfigured()) {
    const sb = getSupabase()!;
    try {
      const { error } = await sb.from('system_settings').upsert(
        {
          id: SETTINGS_SINGLETON_ID,
          is_maintenance_active: next.is_maintenance_active,
          maintenance_title: next.maintenance_title,
          maintenance_message: next.maintenance_message,
          updated_by: next.updated_by,
        },
        { onConflict: 'id' }
      );
      if (error) {
        console.error('[system-settings] upsert error', error.message);
        // fallback to memory anyway so UI ยังทำงานแม้ supabase fail
        setFallback(next);
        return NextResponse.json({ success: false, message: `Supabase error: ${error.message}`, fallback: true, settings: next }, { status: 500 });
      }
      setFallback(next); // sync memory
      return NextResponse.json({ success: true, settings: next });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFallback(next);
      return NextResponse.json({ success: false, message: msg, fallback: true, settings: next }, { status: 500 });
    }
  }

  setFallback(next);
  return NextResponse.json({ success: true, settings: next });
}

// รองรับ PUT ด้วย (alias ของ POST)
export async function PUT(req: NextRequest) {
  return POST(req);
}
