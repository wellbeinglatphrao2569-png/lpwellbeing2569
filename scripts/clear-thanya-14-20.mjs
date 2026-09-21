import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const gas = process.env.NEXT_PUBLIC_GAS_API_URL || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || process.env.GAS_API_URL;
const uid = '1101401686793';
const start = '2026-09-14';
const end = '2026-09-20';

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('UID', uid, 'range', start, '->', end);
console.log('GAS', gas);

// 1. ดู Supabase ก่อนลบ
const { data: before, error: e1 } = await sb.from('steps_log').select('record_id, date_thai, steps_count, status, image_drive_id').eq('user_id', uid).gte('date_thai', start).lte('date_thai', end);
console.log('Supabase before count', before?.length, e1);
console.log(JSON.stringify(before, null, 2));

// ดู GAS
let gasIds = [];
try {
  const r = await fetch(gas + '?path=steps');
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [];
  const filtered = arr.filter(s => String(s.User_ID).trim() === uid && String(s.Date_Thai).slice(0,10) >= start && String(s.Date_Thai).slice(0,10) <= end);
  console.log('GAS before count', filtered.length);
  console.log(JSON.stringify(filtered.map(x=>({Record_ID:x.Record_ID, Date_Thai:String(x.Date_Thai).slice(0,10), Steps_Count:x.Steps_Count, Image_Drive_ID:x.Image_Drive_ID})), null, 2));
  gasIds = filtered;
} catch(e){ console.error('GAS fetch error', e); }

// ถ้ามี --execute จึงลบจริง
const doDelete = process.argv.includes('--execute');
if(!doDelete){
  console.log('\n[DRY RUN] ยังไม่ลบ — รันด้วย --execute เพื่อลบจริง');
  console.log('จะลบ Supabase', before?.length, 'แถว และ GAS', gasIds.length, 'แถว');
  process.exit(0);
}

console.log('\n=== EXECUTE DELETE ===');

// 2. ลบ Supabase: ลบ storage ด้วยถ้าเป็น supabase storage path
for(const row of before||[]){
  const fid = String(row.image_drive_id||'');
  if(fid.includes('supabase.co/storage')){
    // extract path after /steps-images/
    const m = fid.match(/\/steps-images\/(.+)$/);
    const path = m ? m[1] : fid.split('/').pop();
    if(path){
      console.log('  remove storage', path);
      const { error } = await sb.storage.from('steps-images').remove([path]);
      if(error) console.warn('  storage remove error', error.message);
      else console.log('  storage removed', path);
    }
  } else if(fid){
    // drive id — จะให้ GAS ลบด้วย
    console.log('  drive id via GAS later', fid);
  }
}
const { error: delErr, count } = await sb.from('steps_log').delete({ count:'exact' }).eq('user_id', uid).gte('date_thai', start).lte('date_thai', end);
console.log('Supabase delete', delErr, 'count', count);
if(delErr) console.error(delErr);

// 3. ลบ GAS ทีละ Record_ID (GAS จะลบไฟล์ใน Drive ด้วย)
for(const r of gasIds){
  const rid = r.Record_ID;
  console.log('  GAS delete', rid);
  try{
    const res = await fetch(gas, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'delete-step', Record_ID: rid })
    });
    const txt = await res.text();
    console.log('    ->', res.status, txt.slice(0,500));
  }catch(e){ console.error('    GAS delete error', e.message); }
}

console.log('DONE');
