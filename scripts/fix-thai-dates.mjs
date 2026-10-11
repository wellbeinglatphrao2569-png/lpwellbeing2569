// scripts/fix-thai-dates.mjs
// ซ่อมข้อมูลวันที่เลื่อนถอยหลัง 1 วันหลังย้ายมา Supabase (ยึด Timezone ไทย UTC+7)
// ที่มา: โค้ดเดิมใช้ new Date().toISOString().slice(0,10) ซึ่งเป็นวันที่ UTC —
//        ช่วง 00:00–06:59 น. ไทยจะได้วันที่ของเมื่อวาน + migrate ที่ไม่เติม +07:00 ให้ timestamptz
//
// วิธีใช้ (รันจาก root โปรเจกต์):
//   node scripts/fix-thai-dates.mjs --check
//     → รายงานอย่างเดียว: นับรายการ steps_log ตั้งแต่วันที่กำหนด,
//       เทียบ date_thai กับวันที่ไทยที่ได้จาก recorded_at (+7) ว่าต่างกันกี่แถว
//   node scripts/fix-thai-dates.mjs --fix-dates [--from=2026-08-24] [--apply]
//     → เลื่อน date_thai +1 วันให้แถวที่ recorded_at(ไทย) มากกว่า date_thai อยู่ 1 วัน
//       (default เป็น dry-run — ต้องใส่ --apply ถึงจะเขียนจริง)
//   node scripts/fix-thai-dates.mjs --fix-timestamps [--apply]
//     → ลบ 7 ชม. ออกจาก recorded_at/reviewed_at ที่ถูก migrate แบบไม่มี zone
//       (เวลาไทยถูกเก็บเป็น UTC ตรงๆ เช่น 14:00 ไทยกลายเป็น 14:00Z)
//       default dry-run เช่นกัน
//   node scripts/fix-thai-dates.mjs --compare-gas [--apply]
//     → เทียบกับ GAS Sheet (source of truth, Asia/Bangkok) ทีละ record_id แล้วแก้ date_thai
//       ให้ตรงกับ Sheet (ต้องมี NEXT_PUBLIC_GAS_WEB_APP_URL ใน env)
//
// ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (+ GAS URL ถ้าใช้ --compare-gas)
// อ่าน .env.local ก่อน แล้ว fallback .env
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { createClient } from '@supabase/supabase-js';

function arg(name, def = null) {
  const p = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!p) return def;
  const eq = p.indexOf('=');
  return eq >= 0 ? p.slice(eq + 1) : true;
}
const APPLY = arg('apply', false) === true || arg('apply') === '';
const FROM = String(arg('from', '2026-08-24') || '2026-08-24').slice(0, 10);

function normalizeSupabaseUrl(u) {
  if (!u) return u;
  return String(u).trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// วันที่ไทย (UTC+7) ของ timestamptz
function thaiKeyOf(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
function shiftDate(key, days) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function fetchAllSteps(from) {
  const rows = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('steps_log')
      .select('record_id,user_id,date_thai,recorded_at,reviewed_at,status')
      .gte('date_thai', from)
      .order('date_thai', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return rows;
}

async function cmdCheck() {
  const rows = await fetchAllSteps(FROM);
  console.log(`[check] steps_log ตั้งแต่ ${FROM}: ${rows.length} แถว`);
  let offMinus1 = 0;
  let offOther = 0;
  const sample = [];
  for (const r of rows) {
    const recThai = thaiKeyOf(r.recorded_at);
    const dt = String(r.date_thai || '').slice(0, 10);
    if (!recThai || !dt) continue;
    if (recThai !== dt) {
      // recorded_at(ไทย) มากกว่า date_thai 1 วัน = อาการคลาสสิกของบั๊ก UTC slice
      if (shiftDate(dt, 1) === recThai) {
        offMinus1++;
        if (sample.length < 10) sample.push(`${r.record_id} date_thai=${dt} recorded_thai=${recThai}`);
      } else {
        offOther++;
      }
    }
  }
  console.log(`[check] ตรงกัน: ${rows.length - offMinus1 - offOther}`);
  console.log(`[check] สงสัยเลื่อน -1 วัน (recorded ไทย = date_thai+1): ${offMinus1}`);
  console.log(`[check] ต่างแบบอื่น: ${offOther}`);
  for (const s of sample) console.log(`  e.g. ${s}`);
  console.log('\nถ้าตัวเลข "สงสัยเลื่อน -1 วัน" เยอะ ให้รัน --fix-dates (dry-run ก่อน) แล้วค่อย --apply');
}

async function cmdFixDates() {
  const rows = await fetchAllSteps(FROM);
  const targets = rows.filter((r) => {
    const recThai = thaiKeyOf(r.recorded_at);
    const dt = String(r.date_thai || '').slice(0, 10);
    return recThai && dt && shiftDate(dt, 1) === recThai;
  });
  console.log(`[fix-dates] พบ ${targets.length}/${rows.length} แถวที่ date_thai ช้ากว่า recorded_at(ไทย) 1 วัน`);
  if (targets.length === 0) return;
  for (const t of targets.slice(0, 10))
    console.log(`  ${t.record_id}: ${String(t.date_thai).slice(0, 10)} → ${shiftDate(String(t.date_thai).slice(0, 10), 1)}`);
  if (!APPLY) {
    console.log('[fix-dates] DRY-RUN — เพิ่ม --apply เพื่อเขียนจริง');
    return;
  }
  let ok = 0;
  for (const t of targets) {
    const next = shiftDate(String(t.date_thai).slice(0, 10), 1);
    const { error } = await sb.from('steps_log').update({ date_thai: next }).eq('record_id', t.record_id);
    if (error) console.warn(`  FAIL ${t.record_id}: ${error.message}`);
    else ok++;
  }
  console.log(`[fix-dates] อัปเดตสำเร็จ ${ok}/${targets.length}`);
}

async function cmdFixTimestamps() {
  // แถวที่เวลาตก :00 ตรงๆ และชั่วโมง 07:00–23:59 บ่อยผิดปกติ มักมาจาก migrate แบบไม่มี zone
  const rows = await fetchAllSteps(FROM);
  console.log(`[fix-timestamps] ตรวจ ${rows.length} แถว (dry-run ยกเว้นใส่ --apply)`);
  const targets = [];
  for (const r of rows) {
    for (const col of ['recorded_at', 'reviewed_at']) {
      const v = r[col];
      if (!v) continue;
      const d = new Date(v);
      if (isNaN(d.getTime())) continue;
      // heuristic: ถ้าเวลามีวินาที = 00 และนาที = 00 เป๊ะ + มาจากช่วง migrate เก่า → น่าสงสัย
      // (แสดงตัวอย่างเฉยๆ ไม่ฟันธง — ให้ผู้ใช้ยืนยันก่อน apply)
      if (d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
        targets.push({ id: r.record_id, col, val: v });
      }
    }
  }
  console.log(`[fix-timestamps] แถว timestamp ที่ลงท้าย :00 (candidate): ${targets.length} ค่า`);
  for (const t of targets.slice(0, 10)) console.log(`  ${t.id}.${t.col} = ${t.val}`);
  console.log(
    '[fix-timestamps] หมายเหตุ: การลบ 7 ชม. มีผลต่อการแสดงเวลาเท่านั้น ไม่กระทบ date_thai.\n' +
      'ให้ apply ก็ต่อเมื่อยืนยันว่าเวลาใน Supabase เร็วกว่าเวลาจริง 7 ชม. (เช่น บันทึกบ่ายสองแต่โชว์สองทุ่ม)'
  );
  if (!APPLY) {
    console.log('[fix-timestamps] DRY-RUN — เพิ่ม --apply เพื่อเขียนจริง (ลบ 7 ชม.)');
    return;
  }
  let ok = 0;
  for (const t of targets) {
    const d = new Date(new Date(t.val).getTime() - 7 * 60 * 60 * 1000);
    const { error } = await sb.from('steps_log').update({ [t.col]: d.toISOString() }).eq('record_id', t.id);
    if (!error) ok++;
  }
  console.log(`[fix-timestamps] อัปเดตสำเร็จ ${ok}/${targets.length}`);
}

async function cmdCompareGas() {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || process.env.GAS_WEB_APP_URL || process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL;
  if (!GAS_URL) {
    console.error('ต้องมี GAS URL ใน env เพื่อใช้ --compare-gas');
    process.exit(1);
  }
  const res = await fetch(`${GAS_URL}?path=steps`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GAS steps HTTP ${res.status}`);
  const j = await res.json();
  const gasRows = Array.isArray(j) ? j : j.data || j.steps || j.rows || [];
  const gasById = new Map(gasRows.map((r) => [String(r.Record_ID || r.record_id), String(r.Date_Thai || r.date_thai || '').slice(0, 10)]));
  console.log(`[compare-gas] GAS rows: ${gasRows.length}`);
  const rows = await fetchAllSteps(FROM);
  const diffs = rows.filter((r) => {
    const g = gasById.get(String(r.record_id));
    return g && g !== String(r.date_thai).slice(0, 10);
  });
  console.log(`[compare-gas] ต่างจาก Sheet: ${diffs.length}/${rows.length}`);
  for (const d of diffs.slice(0, 15))
    console.log(`  ${d.record_id}: supabase=${String(d.date_thai).slice(0, 10)} sheet=${gasById.get(String(d.record_id))}`);
  if (!APPLY) {
    console.log('[compare-gas] DRY-RUN — เพิ่ม --apply เพื่อเขียน date_thai ให้ตรง Sheet');
    return;
  }
  let ok = 0;
  for (const d of diffs) {
    const g = gasById.get(String(d.record_id));
    const { error } = await sb.from('steps_log').update({ date_thai: g }).eq('record_id', d.record_id);
    if (!error) ok++;
  }
  console.log(`[compare-gas] อัปเดตสำเร็จ ${ok}/${diffs.length}`);
}

const mode = process.argv.includes('--fix-dates')
  ? 'fix-dates'
  : process.argv.includes('--fix-timestamps')
    ? 'fix-timestamps'
    : process.argv.includes('--compare-gas')
      ? 'compare-gas'
      : 'check';
console.log(`mode=${mode} from=${FROM} apply=${APPLY ? 'YES' : 'no (dry-run)'}`);
if (mode === 'check') await cmdCheck();
else if (mode === 'fix-dates') await cmdFixDates();
else if (mode === 'fix-timestamps') await cmdFixTimestamps();
else await cmdCompareGas();
