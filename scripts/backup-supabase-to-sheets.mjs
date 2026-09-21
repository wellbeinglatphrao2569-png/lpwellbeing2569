// scripts/backup-supabase-to-sheets.mjs
// สำรอง Supabase (หลัก) -> Google Sheet (สำรอง) แบบรอบเวลา
// รัน: node scripts/backup-supabase-to-sheets.mjs
// หรือตั้ง cron 23:59 ทุกวัน (Asia/Bangkok) — ดู src/app/api/cron/backup/route.ts
// ไม่ให้เว็บดึง Sheet มาใช้ตรง — ใช้ไฟล์นี้เป็นจุดเดียวที่เขียนกลับ Sheet
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getEnv(name, fallback=''){ return process.env[name] || process.env[`NEXT_PUBLIC_${name}`] || fallback; }

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL || process.env.GAS_API_URL || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || '';

if(!SUPABASE_URL || !SERVICE_KEY){
  console.error('Missing SUPABASE_URL / SERVICE_KEY'); process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {auth:{persistSession:false}});

async function dumpTable(table, orderBy){
  let all=[]; let from=0;
  while(true){
    let q = sb.from(table).select('*');
    if(orderBy) q = q.order(orderBy,{ascending:true});
    const {data,error} = await q.range(from, from+999);
    if(error) throw error;
    if(!data || data.length===0) break;
    all.push(...data);
    if(data.length<1000) break;
    from+=1000;
  }
  return all;
}

async function main(){
  const mode = process.argv.includes('--dry') ? 'dry' : 'full';
  const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out')+1] : null;
  console.log(`[backup] mode=${mode} supabase=${SUPABASE_URL} gas=${GAS_URL ? 'yes' : 'no'}`);
  const t0 = Date.now();
  const users = await dumpTable('users','created_at');
  const steps = await dumpTable('steps_log','date_thai');
  const sweet = await dumpTable('sweet_free','wednesday_date');
  const proj = await dumpTable('project_settings', null);
  const settings = await dumpTable('system_settings', null);
  console.log(`[backup] users=${users.length} steps=${steps.length} sweet=${sweet.length} project=${proj.length} settings=${settings.length}`);

  const payload = { generatedAt: new Date().toISOString(), users, steps_log: steps, sweet_free: sweet, project_settings: proj, system_settings: settings };
  // 1) เขียนไฟล์ local (data/backup-YYYY-MM-DD.json) ไว้กู้คืนเมื่อ Supabase มีปัญหา — ไม่ให้เว็บอ่าน Sheet ตรง ต้อง restore กลับ Supabase ก่อน
  const stamp = new Date().toISOString().slice(0,10);
  const dir = path.join(process.cwd(),'data','backups');
  fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir, `supabase-backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload,null,2),'utf-8');
  console.log(`[backup] wrote ${file} (${(fs.statSync(file).size/1024).toFixed(1)} KB)`);
  if(outDir){
    fs.mkdirSync(outDir,{recursive:true});
    fs.writeFileSync(path.join(outDir, `supabase-backup-${stamp}.json`), JSON.stringify(payload,null,2));
  }

  if(mode==='dry'){ console.log('[backup] dry run — ไม่ยิง GAS'); return; }

  if(!GAS_URL){
    console.warn('[backup] GAS_URL ไม่ตั้งค่า — ข้ามการยิง Sheet (ยังมีไฟล์ local สำหรับกู้คืน)');
    return;
  }

  // 2) ยิงสำรองไป GAS (backup endpoint) — GAS ต้องมี action backup-supabase (ถ้ายังไม่มีจะเก็บเป็นไฟล์ Sheet แบบ append ก็ได้)
  // ใช้ fire-and-forget แบบก้อนเดียว ไม่บล็อกการใช้งานเว็บ (เว็บใช้ Supabase โดยตรงอยู่แล้ว)
  try{
    const res = await fetch(GAS_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'backup-supabase', generatedAt: payload.generatedAt, counts:{users:users.length, steps:steps.length, sweet:sweet.length}, data: payload }),
    });
    const txt = await res.text();
    console.log(`[backup] GAS response ${res.status}: ${txt.slice(0,800)}`);
    if(!res.ok) throw new Error(`GAS ${res.status}`);
  }catch(e){
    console.warn('[backup] GAS backup failed (ไม่เป็นไร — ยังมีไฟล์ local)', e.message);
    // ไม่ throw — สำรองไฟล์ local ก็พอตามสเปค
  }

  console.log(`[backup] done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
