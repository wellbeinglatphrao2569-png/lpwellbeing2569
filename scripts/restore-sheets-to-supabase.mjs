// scripts/restore-sheets-to-supabase.mjs
// กู้คืนจาก Sheet (สำรอง) -> Supabase (หลัก) เมื่อ Supabase มีปัญหา
// ห้ามให้เว็บอ่าน Sheet โดยตรง — ต้องรันสคริปต์นี้เพื่อใส่กลับ Supabase ก่อน
// ใช้: node scripts/restore-sheets-to-supabase.mjs --file data/backups/supabase-backup-2026-09-21.json
// หรือดึงจาก GAS: node scripts/restore-sheets-to-supabase.mjs --from-gas
import dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
import {createClient} from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL || '';
if(!SUPABASE_URL || !KEY){ console.error('Missing env'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, {auth:{persistSession:false}});

async function fetchFromGas(path){
  const r=await fetch(`${GAS_URL}?path=${path}`);
  if(!r.ok) throw new Error(`GAS ${path} ${r.status}`);
  const j=await r.json();
  return Array.isArray(j)?j:(j.rows||j.data||[]);
}

async function main(){
  let payload;
  const fileIdx = process.argv.indexOf('--file');
  if(fileIdx!==-1){
    const p = process.argv[fileIdx+1];
    payload = JSON.parse(fs.readFileSync(p,'utf-8'));
  } else if(process.argv.includes('--from-gas')){
    console.log('Fetching from GAS...');
    const users = await fetchFromGas('users');
    const steps = await fetchFromGas('steps');
    const sweet = await fetchFromGas('sweet-free');
    payload = { users, steps_log: steps, sweet_free: sweet };
  } else {
    console.error('Use --file <path> or --from-gas'); process.exit(1);
  }
  console.log(`Restore users=${payload.users?.length} steps=${payload.steps_log?.length} sweet=${payload.sweet_free?.length}`);
  // ตัวอย่างใส่กลับ (ต้อง map ให้ตรง schema จริง — ใช้ upsert)
  if(payload.users){
    for(let i=0;i<payload.users.length;i+=500){
      const chunk = payload.users.slice(i,i+500).map(u=>({
        user_id: u.user_id||u.User_ID, full_name:u.full_name||u.Full_Name, department:u.department||u.Department,
        // เติม field อื่นตาม docs/supabase_full_migration.sql
      }));
      // await sb.from('users').upsert(chunk,{onConflict:'user_id'});
    }
    console.log('Users restore skeleton — เติม mapping ให้ครบก่อนรันจริง');
  }
  console.log('Done (dry — ตรวจโค้ดก่อนใส่จริง)');
}
main().catch(e=>{console.error(e); process.exit(1);});
