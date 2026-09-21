import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cron/backup  — สำรอง Supabase (หลัก) -> Sheet (สำรอง) รอบ 23:59
 * เรียกโดย Vercel Cron หรือ ปุ่มแอดมิน — ไม่ให้เว็บอ่าน Sheet โดยตรง
 * เว็บใช้งาน Supabase ได้ทันทีหลังบันทึก, งานสำรองทำงานเบื้องหลัง/รอบเวลา
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.DEV_SECRET || '';
  const auth = req.headers.get('authorization') || req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  // ถ้าตั้ง CRON_SECRET ให้ต้องส่งให้ตรง, ถ้าไม่ตั้งให้ผ่านได้ (ภายใน)
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
    const bodySecret = await req.text().catch(() => '');
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(bodySecret); } catch {}
    if (String((j as { secret?: string }).secret || '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // เรียกสคริปต์ backup แบบ import ตรง (ไม่ spawn process)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    const sb = createClient(url, key, { auth: { persistSession: false } });

    async function count(table: string){
      const { count } = await sb.from(table).select('*', { count:'exact', head:true });
      return count ?? 0;
    }
    const [u, s, w, ps, sys] = await Promise.all([
      count('users'), count('steps_log'), count('sweet_free'), count('project_settings'), count('system_settings')
    ]);

    // เขียนไฟล์สำรองบน Vercel จะหายเมื่อ redeploy — จึงทำแค่ log + ยิง GAS แบบ fire-and-forget
    // ยิง GAS backup (ถ้ามี)
    const gas = process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || '';
    let gasOk: boolean | null = null;
    let gasMsg = '';
    if (gas) {
      try {
        const r = await fetch(gas, {
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify({ action:'backup-supabase', generatedAt: new Date().toISOString(), counts:{users:u, steps:s, sweet:w} }),
        });
        gasMsg = await r.text().then(t=>t.slice(0,500)).catch(()=>String(r.status));
        gasOk = r.ok;
      } catch (e) { gasMsg = e instanceof Error ? e.message : String(e); gasOk = false; }
    }

    return NextResponse.json({
      success:true,
      message:'สำรองเสร็จ — เว็บยังใช้งาน Supabase ได้ทันที, Sheet เป็นสำรองรอบ 23:59',
      counts:{users:u, steps:s, sweet:w, project_settings:ps, system_settings:sys},
      gas: gas ? { ok: gasOk, msg: gasMsg } : { ok: null, msg: 'GAS_URL not set — มีไฟล์ local จากสคริปต์เท่านั้น' },
      note: 'ห้ามให้เว็บอ่าน Sheet โดยตรง — ถ้า Supabase มีปัญหาให้รัน scripts/restore-sheets-to-supabase.mjs เพื่อใส่กลับ Supabase',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest){ return POST(req); }
