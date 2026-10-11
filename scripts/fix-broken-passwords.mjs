// scripts/fix-broken-passwords.mjs
// ซ่อมรหัสผ่านที่ถูกเขียนผิดฟอร์แมตโดยบั๊ก hashPasswordNode เดิม (crypto.randomUUID ไม่มีใน browser)
// อาการ: password = "salt$salt+plaintext" (parts[1] ไม่ใช่ 64-hex) หรือไม่มี '$' เลย
// วิธีใช้ (รันจาก root โปรเจกต์):
//   node scripts/fix-broken-passwords.mjs            → dry-run (รายงานอย่างเดียว)
//   node scripts/fix-broken-passwords.mjs --apply     → เขียนจริง
//   node scripts/fix-broken-passwords.mjs --reset-all → ตั้ง pass1234 ให้ทุกรายที่เสีย (ไม่กู้จากค่าเดิม)
//
// กลยุทธ์ซ่อมรายแถว:
//   ถ้า parts = [salt, salt+plaintext]  → ถอด plaintext แล้ว hash ใหม่จาก plaintext นั้น (คงรหัสเดิมของผู้ใช้)
//   ถ้าฟอร์แมตเพี้ยนแบบอื่น/กู้ไม่ได้ → ตั้ง pass1234 แล้วรายงานรายชื่อให้ admin แจ้งผู้ใช้
// ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — อ่าน .env.local ก่อน
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';

const APPLY = process.argv.includes('--apply');
const RESET_ALL = process.argv.includes('--reset-all');
const SALT_LEN = 16;

function sha256Hex(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function hashPassword(pwd) {
  const salt = randomUUID().replace(/-/g, '').slice(0, SALT_LEN);
  return `${salt}$${sha256Hex(salt + pwd)}`;
}
function isProperHash(stored) {
  const p = String(stored || '').split('$');
  return p.length === 2 && p[0].length === SALT_LEN && /^[0-9a-f]{64}$/.test(p[1]);
}

function normalizeSupabaseUrl(u) {
  return String(u || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}
const U = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
const K = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!U || !K) { console.error('Missing ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(U, K, { auth: { persistSession: false } });

// อ่าน users ทั้งหมด
const rows = [];
let page = 0;
while (true) {
  const { data, error } = await sb.from('users')
    .select('user_id,personnel_id,full_name,password,registration_status')
    .order('user_id').range(page * 1000, page * 1000 + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < 1000) break;
  page++;
}
console.log(`[fix-passwords] users ทั้งหมด: ${rows.length}`);

const fixKeep = [];   // กู้จากรหัสเดิมได้ (plaintext ที่ค้างอยู่)
const fixReset = [];  // ต้องตั้ง pass1234
let okCount = 0, emptyCount = 0;

for (const r of rows) {
  const stored = String(r.password || '');
  if (!stored) { emptyCount++; continue; }
  if (isProperHash(stored)) { okCount++; continue; }
  // ฟอร์แมตผิด — พยายามกู้ plaintext จาก "salt$salt+plaintext"
  const parts = stored.split('$');
  let recovered = null;
  if (parts.length === 2 && parts[0].length === SALT_LEN && parts[1].startsWith(parts[0])) {
    recovered = parts[1].slice(parts[0].length); // plaintext ที่ browser fallback  concatenate ไว้
  }
  if (!RESET_ALL && recovered && recovered.length >= 6) {
    fixKeep.push({ ...r, action: 'keep', recovered });
  } else {
    fixReset.push({ ...r, action: 'reset' });
  }
}

console.log(`[fix-passwords] ฟอร์แมตถูกต้องแล้ว: ${okCount}`);
console.log(`[fix-passwords] password ว่าง (ยังไม่ลงทะเบียน): ${emptyCount}`);
console.log(`[fix-passwords] ต้องซ่อม — กู้รหัสเดิมได้: ${fixKeep.length}`);
console.log(`[fix-passwords] ต้องซ่อม — ตั้ง pass1234: ${fixReset.length}`);

if (fixKeep.length) {
  console.log('--- ตัวอย่างกู้รหัสเดิมได้ (จะคงรหัสเดิมของผู้ใช้) ---');
  for (const f of fixKeep.slice(0, 10)) console.log(`  ${f.user_id} ${f.full_name || ''} -> recovered len=${f.recovered.length}`);
}
if (fixReset.length) {
  console.log('--- ต้องตั้ง pass1234 (แจ้งผู้ใช้ภายหลัง) ---');
  for (const f of fixReset.slice(0, 15)) console.log(`  ${f.user_id} ${f.full_name || ''} (เดิมฟอร์แมตเพี้ยน)`);
}

if (!APPLY) {
  console.log('\n[fix-passwords] DRY-RUN — เพิ่ม --apply เพื่อเขียนจริง (หรือ --reset-all --apply เพื่อตั้ง pass1234 ทุกราย)');
  process.exit(0);
}

let ok = 0, fail = 0;
for (const f of fixKeep) {
  const hashed = hashPassword(f.recovered);
  const { error } = await sb.from('users').update({ password: hashed }).eq('user_id', f.user_id);
  if (error) { console.warn(`  FAIL ${f.user_id}: ${error.message}`); fail++; } else ok++;
}
for (const f of fixReset) {
  const hashed = hashPassword('pass1234');
  const { error } = await sb.from('users').update({ password: hashed }).eq('user_id', f.user_id);
  if (error) { console.warn(`  FAIL ${f.user_id}: ${error.message}`); fail++; } else ok++;
}
console.log(`[fix-passwords] อัปเดตสำเร็จ ${ok}, ล้มเหลว ${fail}`);
if (fixReset.length) console.log(`[fix-passwords] แจ้งผู้ใช้ ${fixReset.length} รายนี้ให้ใช้รหัส pass1234 หลัง deploy`);
