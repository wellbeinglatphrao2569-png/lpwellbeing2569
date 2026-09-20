// scripts/migrate-sheets-to-supabase.mjs
// ย้ายข้อมูลจาก GAS (Google Sheet) -> Supabase แบบอัตโนมัติ
// ใช้: 1) เติม ENV แล้ว 2) node scripts/migrate-sheets-to-supabase.mjs
// ENV ต้องมี: NEXT_PUBLIC_GAS_API_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback .env
import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(u){
  if(!u) return u;
  let s = String(u).trim();
  // ตัด /rest/v1/ หรือ /rest/v1 ทิ้ง — SDK เติมเอง
  s = s.replace(/\/rest\/v1\/?$/,'');
  s = s.replace(/\/+$/,'');
  return s;
}
const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL;
const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!GAS_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing ENV: NEXT_PUBLIC_GAS_API_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{persistSession:false}});

// แปลง พ.ศ. -> ค.ศ. (2026-08-24 พ.ศ.2569 -> 2026-08-24)
function toAD(dateStr){
  if(!dateStr) return null;
  const s = String(dateStr).slice(0,10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return s;
  let y = parseInt(m[1],10);
  if(y>2400) y-=543; // พ.ศ.
  return `${String(y).padStart(4,'0')}-${m[2]}-${m[3]}`;
}
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function bool(v){ if(v===true||v===false) return v; if(String(v).toLowerCase()==='true') return true; if(String(v).toLowerCase()==='false') return false; return null; }

async function fetchGAS(path, retries=2){
  const url = `${GAS_URL}?path=${path}`;
  console.log(`  GET ${url}`);
  let lastErr;
  for(let attempt=0; attempt<=retries; attempt++){
    try{
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok){
        const txt = await res.text().catch(()=> '');
        throw new Error(`${path} HTTP ${res.status} ${txt.slice(0,300)}`);
      }
      const j = await res.json();
      if(Array.isArray(j)) return j;
      if(j && Array.isArray(j.data)) return j.data;
      if(j && Array.isArray(j.users)) return j.users;
      if(j && Array.isArray(j.steps)) return j.steps;
      if(j && Array.isArray(j.rows)) return j.rows; // paged
      return j;
    }catch(e){
      lastErr=e;
      if(attempt<retries){
        console.log(`  retry ${attempt+1}/${retries} after error: ${e.message.slice(0,120)}`);
        await new Promise(r=>setTimeout(r, 1500*(attempt+1)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

async function fetchGASAll(path){
  // ลองแบบ paginated ก่อน (limit/offset) เพื่อให้ได้ครบแม้ข้อมูลเยอะ — ถ้า GAS ไม่รองรับจะ fallback แบบเดิม
  const limit = 1000;
  let offset = 0;
  let all = [];
  while(true){
    const url = `${GAS_URL}?path=${path}&limit=${limit}&offset=${offset}`;
    console.log(`  GET ${url}`);
    let j;
    try{
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      j = await res.json();
    }catch(e){
      if(all.length===0) throw e; // ถ้ายังไม่ได้อะไรเลย ให้ error
      console.warn(`  paginated fetch warn at offset ${offset}: ${e.message} — return ${all.length} so far`);
      break;
    }
    // GAS paged returns {rows,total,hasMore} — ถ้าได้ array แสดงว่า fallback
    if(Array.isArray(j)){
      // server ไม่รองรับ pagination — คืน array ทั้งหมดเลย
      if(offset===0) return j;
      all.push(...j);
      break;
    }
    if(j && Array.isArray(j.rows)){
      all.push(...j.rows);
      console.log(`  paged ${j.rows.length} rows (total ${j.total}, hasMore ${j.hasMore})`);
      if(!j.hasMore || j.rows.length < limit) break;
      offset += limit;
      // กัน loop ยาว
      if(offset > 10000) break;
      await new Promise(r=>setTimeout(r, 300));
    } else if(j && Array.isArray(j.data)){
      all.push(...j.data);
      break;
    } else {
      // unknown shape — ลอง fetch แบบไม่ paginated
      if(all.length===0){
        return await fetchGAS(path);
      }
      break;
    }
  }
  if(all.length>0) return all;
  // fallback ปกติ
  return await fetchGAS(path);
}

async function migrateUsers(){
  console.log('\n[1/4] users...');
  const rows = await fetchGASAll('users');
  console.log(`  fetched ${rows.length} rows`);
  // debug: ดูแถวที่ User_ID ว่าง
  const emptySample = rows.filter(r=>!String(r.User_ID||'').trim()).slice(0,3);
  if(emptySample.length) console.log('  empty User_ID sample', emptySample.map(r=>JSON.stringify(r).slice(0,300)));
  const mapped = rows.map(r=>({
    user_id: String(r.User_ID||r.Personnel_ID||r.user_id||'').trim(), // fallback Personnel_ID กันแถวว่าง
    prefix: r.Prefix||null,
    full_name: r.Full_Name||r.full_name||`(no name ${r.Personnel_ID||''})`,
    nickname: r.Nickname||null,
    position: r.Position||null,
    department: r.Department||null,
    birth_date: toAD(r.Birth_Date||r.birth_date),
    gender: r.Gender||null,
    lgbtq_identity: r.LGBTQ_Identity||null,
    weight_kg: num(r.Weight_kg),
    height_cm: num(r.Height_cm),
    bmi_value: num(r.BMI_Value),
    waist_inch: num(r.Waist_Inch),
    role: r.Role||'Employee',
    password: r.Password||null,
    total_points: parseInt(r.Total_Points||0,10)||0,
    level: String(r.Level||'1'),
    personnel_id: r.Personnel_ID||null,
    registration_status: r.Registration_Status||'',
    created_by: r.Created_By||null,
    created_date: toAD(r.Created_Date),
    first_name: r.First_Name||null,
    last_name: r.Last_Name||null,
    profile_image: r.Profile_Image||null,
    activities: r.Activities||null,
    step_record_mode: r.Step_Record_Mode? String(r.Step_Record_Mode): null,
    device_token: r.Device_Token||null,
    device_updated_at: r.Device_Updated_At||null,
  })).filter(x=>x.user_id);
  // dedup users by user_id
  const dedupUsers = Array.from(new Map(mapped.map(r=>[r.user_id, r])).values());
  if(dedupUsers.length !== mapped.length) console.log(`  dedup users ${mapped.length} -> ${dedupUsers.length}`);
  // log empty
  if(mapped.length < rows.length) console.log(`  filtered out ${rows.length - mapped.length} rows with empty user_id`);
  for(let i=0;i<dedupUsers.length;i+=500){
    const chunk = dedupUsers.slice(i,i+500);
    const { error } = await sb.from('users').upsert(chunk, { onConflict:'user_id' });
    if(error) throw error;
    console.log(`  upsert ${i+chunk.length}/${dedupUsers.length}`);
  }
  console.log('  users done');
}

async function migrateSteps(){
  console.log('\n[2/4] steps_log...');
  const rows = await fetchGASAll('steps');
  console.log(`  fetched ${rows.length} rows`);
  const mapped = rows.map(r=>({
    record_id: String(r.Record_ID||r.record_id||crypto.randomUUID()),
    user_id: String(r.User_ID||r.user_id||'').trim(),
    date_thai: toAD(r.Date_Thai||r.date_thai||r.Date),
    steps_count: parseInt(r.Steps_Count||r.steps_count||0,10)||0,
    submitted_steps: r.Submitted_Steps!=null? parseInt(r.Submitted_Steps,10): null,
    record_method: r.Record_Method||null,
    image_drive_id: r.Image_Drive_ID||null,
    status: (()=>{
      const s = String(r.Status||'Pending').trim();
      // Supabase check เดิมอนุญาตแค่ 3 ค่า — แปลง Deleted -> Rejected กัน error
      if(['Pending','Approved','Rejected'].includes(s)) return s;
      if(s==='Deleted') return 'Rejected';
      return 'Pending';
    })(),
    week_number: r.Week_Number? parseInt(r.Week_Number,10): null,
    auditor_id: r.Auditor_ID||null,
    reviewed_at: r.Reviewed_At||null,
    recorded_at: r.Recorded_At||null,
    reject_reason: r.Reject_Reason||null,
    ai_steps: r.AI_Steps!=null? parseInt(r.AI_Steps,10): null,
    ai_confidence: r.AI_Confidence!=null? num(r.AI_Confidence): null,
    date_match: r.Date_Match!=null? bool(r.Date_Match): null,
    alert_flag: r.Alert_Flag!=null? bool(r.Alert_Flag): false,
    alert_reason: r.Alert_Reason||null,
    notes: r.Notes||null,
  })).filter(x=>x.user_id && x.date_thai);
  // dedup by record_id (last wins) — แก้ ON CONFLICT cannot affect row a second time
  const dedupSteps = Array.from(new Map(mapped.map(r=>[r.record_id, r])).values());
  if(dedupSteps.length !== mapped.length) console.log(`  dedup steps ${mapped.length} -> ${dedupSteps.length}`);
  // สร้าง placeholder users สำหรับ user_id ที่ไม่มีใน users (กัน FK error เช่น P036)
  try{
    const distinctIds = [...new Set(dedupSteps.map(r=>r.user_id))];
    const { data: existing } = await sb.from('users').select('user_id').in('user_id', distinctIds.slice(0,1000));
    const existSet = new Set((existing||[]).map(x=>x.user_id));
    const missing = distinctIds.filter(id=>!existSet.has(id));
    if(missing.length){
      console.log(`  creating ${missing.length} placeholder users for missing ids:`, missing.slice(0,5));
      const placeholders = missing.map(id=>({ user_id:id, full_name:`(placeholder ${id})`, role:'Employee' }));
      for(let i=0;i<placeholders.length;i+=500){
        const c = placeholders.slice(i,i+500);
        const { error } = await sb.from('users').upsert(c, { onConflict:'user_id' });
        if(error) console.warn('  placeholder insert warn', error.message);
      }
    }
  }catch(e){ console.warn('  placeholder check warn', e.message); }
  for(let i=0;i<dedupSteps.length;i+=500){
    const chunk = dedupSteps.slice(i,i+500);
    const { error } = await sb.from('steps_log').upsert(chunk, { onConflict:'record_id' });
    if(error) throw error;
    console.log(`  upsert ${i+chunk.length}/${dedupSteps.length}`);
  }
  console.log('  steps_log done');
}

async function migrateSweet(){
  console.log('\n[3/4] sweet_free...');
  const rows = await fetchGASAll('sweet-free');
  console.log(`  fetched ${rows.length} rows`);
  const mapped = rows.map(r=>({
    entry_id: String(r.Entry_ID||r.entry_id||crypto.randomUUID()),
    user_id: String(r.User_ID||r.user_id||'').trim(),
    wednesday_date: toAD(r.Wednesday_Date||r.wednesday_date),
    status: (bool(r.Status) ?? false),
    logged_by: r.Logged_By||null,
    reason: r.Reason||null,
    recorded_at: r.Recorded_At||null,
  })).filter(x=>x.user_id && x.wednesday_date);
  for(let i=0;i<mapped.length;i+=500){
    const chunk = mapped.slice(i,i+500);
    const { error } = await sb.from('sweet_free').upsert(chunk, { onConflict:'entry_id' });
    if(error) throw error;
    console.log(`  upsert ${i+chunk.length}/${mapped.length}`);
  }
  console.log('  sweet_free done');
}

async function migrateProjectWindow(){
  console.log('\n[4/4] project_settings...');
  try{
    const data = await fetchGAS('project-window');
    const s = toAD(data.start||data.Start_Date);
    const e = toAD(data.end||data.End_Date);
    if(s && e){
      const { error } = await sb.from('project_settings').upsert({ id:1, start_date:s, end_date:e }, { onConflict:'id' });
      if(error) throw error;
      console.log(`  project_settings ${s} -> ${e} done`);
    } else console.log('  skip: no data');
  }catch(e){ console.log('  skip project_settings:', e.message); }
}

async function main(){
  console.log('GAS:', GAS_URL);
  console.log('Supabase:', SUPABASE_URL);
  await migrateUsers();
  await migrateSteps();
  await migrateSweet();
  await migrateProjectWindow();
  console.log('\nDone. Verify: select count(*) from users; select count(*) from steps_log; select count(*) from sweet_free;');
}
main().catch(e=>{ console.error(e); process.exit(1); });
