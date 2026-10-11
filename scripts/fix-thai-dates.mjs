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

const utcWall = (v) => {
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};
const thaiWallOf = (v) => {
  // wall-clock ไทยของ instant ใดๆ (ใช้กับค่า ISO จาก GAS ซึ่งมี zone ถูกต้อง)
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
};
async function fetchGasSteps() {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || process.env.GAS_WEB_APP_URL || process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL;
  if (!GAS_URL) throw new Error('ต้องมี GAS URL ใน env');
  let j = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GAS_URL}?path=steps`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GAS steps HTTP ${res.status}`);
      j = await res.json();
      break;
    } catch (e) {
      lastErr = e.message;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!j) throw new Error(`GAS fetch failed: ${lastErr}`);
  return Array.isArray(j) ? j : j.data || j.steps || j.rows || [];
}
async function cmdFixTimestamps() {
  // ซ่อม recorded_at/reviewed_at ที่ถูก migrate แบบไม่มี zone (เวลาไทยถูกเก็บเป็น UTC ตรงๆ)
  // กฎต่อแถว (เข้มงวด): แก้เฉพาะแถวที่ wall-clock UTC ใน Supabase ตรงกับ wall-clock ไทยใน Sheet พอดี
  // เช่น Sheet "25/08 14:00" (ISO 07:00Z) แต่ Supabase เก็บ "14:00Z" → ลบ 7 ชม. เหลือ 07:00Z (instant จริง)
  const gasRows = await fetchGasSteps();
  const gasById = new Map(gasRows.map((r) => [String(r.Record_ID || r.record_id), r]));
  console.log(`[fix-timestamps] GAS rows: ${gasRows.length}`);
  const rows = await fetchAllSteps(FROM);
  const targets = [];
  for (const r of rows) {
    const g = gasById.get(String(r.record_id));
    if (!g) continue; // แถวใหม่หลัง migrate — ข้าม (instant ถูกต้องอยู่แล้ว)
    for (const [col, gasField] of [['recorded_at', 'Recorded_At'], ['reviewed_at', 'Reviewed_At']]) {
      const supa = r[col];
      const gas = g[gasField];
      if (!supa || !gas) continue;
      if (utcWall(supa) === thaiWallOf(gas)) {
        targets.push({ id: r.record_id, col, from: supa, to: new Date(new Date(supa).getTime() - 7 * 60 * 60 * 1000).toISOString() });
      }
    }
  }
  console.log(`[fix-timestamps] ยืนยันเพี้ยน +7 ชม. ตรงกับ Sheet: ${targets.length} ค่า`);
  for (const t of targets.slice(0, 10)) console.log(`  ${t.id}.${t.col}: ${t.from} → ${t.to}`);
  if (!APPLY) {
    console.log('[fix-timestamps] DRY-RUN — เพิ่ม --apply เพื่อเขียนจริง');
    return;
  }
  let ok = 0;
  for (const t of targets) {
    const { error } = await sb.from('steps_log').update({ [t.col]: t.to }).eq('record_id', t.id);
    if (error) console.warn(`  FAIL ${t.id}.${t.col}: ${error.message}`);
    else ok++;
  }
  console.log(`[fix-timestamps] อัปเดตสำเร็จ ${ok}/${targets.length}`);
}

// วันที่ไทยของค่า Date_Thai จาก GAS — GAS ส่ง Date object เป็น ISO (script TZ = Asia/Bangkok)
// เช่น "2026-08-24T17:00:00.000Z" = 25 ส.ค. 00:00 ไทย → ต้อง +7 ก่อนตัดวัน (ห้าม slice ตรงๆ)
function gasThaiKey(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (/[T ]\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    return thaiKeyOf(d);
  }
  return s.slice(0, 10);
}
async function cmdCompareGas() {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || process.env.GAS_WEB_APP_URL || process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL;
  if (!GAS_URL) {
    console.error('ต้องมี GAS URL ใน env เพื่อใช้ --compare-gas');
    process.exit(1);
  }
  let j = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GAS_URL}?path=steps`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GAS steps HTTP ${res.status}`);
      j = await res.json();
      break;
    } catch (e) {
      lastErr = e.message;
      console.warn(`  GAS retry ${attempt + 1}/3: ${lastErr}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!j) throw new Error(`GAS fetch failed: ${lastErr}`);
  const gasRows = Array.isArray(j) ? j : j.data || j.steps || j.rows || [];
  const gasById = new Map(gasRows.map((r) => [String(r.Record_ID || r.record_id), gasThaiKey(r.Date_Thai || r.date_thai || '')]));
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

async function cmdCompareGasUsers() {
  // เทียบ users.birth_date/created_date กับ Sheet ทีละ user_id (กันบั๊ก toAD slice แบบเดียวกับ steps_log)
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || process.env.GAS_WEB_APP_URL || process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL;
  if (!GAS_URL) {
    console.error('ต้องมี GAS URL ใน env');
    process.exit(1);
  }
  let j = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GAS_URL}?path=users`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GAS users HTTP ${res.status}`);
      j = await res.json();
      break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!j) throw new Error('GAS fetch failed');
  const gasRows = Array.isArray(j) ? j : j.data || j.users || j.rows || [];
  const gB = new Map(gasRows.map((r) => [String(r.User_ID || r.user_id), gasThaiKey(r.Birth_Date || r.birth_date || '')]));
  const gC = new Map(gasRows.map((r) => [String(r.User_ID || r.user_id), gasThaiKey(r.Created_Date || r.created_date || '')]));
  console.log(`[compare-gas-users] GAS users: ${gasRows.length}`);
  const rows = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb.from('users').select('user_id,birth_date,created_date').range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  const fixes = [];
  for (const r of rows) {
    const id = String(r.user_id);
    if (r.birth_date) {
      const g = gB.get(id);
      const s = String(r.birth_date).slice(0, 10);
      if (g && g !== s) fixes.push({ id, col: 'birth_date', from: s, to: g });
    }
    if (r.created_date) {
      const g = gC.get(id);
      const s = String(r.created_date).slice(0, 10);
      if (g && g !== s) fixes.push({ id, col: 'created_date', from: s, to: g });
    }
  }
  console.log(`[compare-gas-users] ต่างจาก Sheet: ${fixes.length}/${rows.length}`);
  for (const f of fixes.slice(0, 10)) console.log(`  ${f.id}.${f.col}: ${f.from} → ${f.to}`);
  if (!APPLY) {
    console.log('[compare-gas-users] DRY-RUN — เพิ่ม --apply เพื่อเขียนให้ตรง Sheet');
    return;
  }
  let ok = 0;
  for (const f of fixes) {
    const { error } = await sb.from('users').update({ [f.col]: f.to }).eq('user_id', f.id);
    if (error) console.warn(`  FAIL ${f.id}.${f.col}: ${error.message}`);
    else ok++;
  }
  console.log(`[compare-gas-users] อัปเดตสำเร็จ ${ok}/${fixes.length}`);
}

const mode = process.argv.includes('--fix-dates')
  ? 'fix-dates'
  : process.argv.includes('--fix-timestamps')
    ? 'fix-timestamps'
    : process.argv.includes('--compare-gas-users')
      ? 'compare-gas-users'
      : process.argv.includes('--compare-gas')
        ? 'compare-gas'
        : 'check';
console.log(`mode=${mode} from=${FROM} apply=${APPLY ? 'YES' : 'no (dry-run)'}`);
if (mode === 'check') await cmdCheck();
else if (mode === 'fix-dates') await cmdFixDates();
else if (mode === 'fix-timestamps') await cmdFixTimestamps();
else if (mode === 'compare-gas-users') await cmdCompareGasUsers();
else await cmdCompareGas();
