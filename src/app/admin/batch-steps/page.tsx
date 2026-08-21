'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import GlassCard from "@/components/ui/GlassCard";
import ConfirmPopup from "@/components/ui/ConfirmPopup";
import ResultPopup from "@/components/ui/ResultPopup";
import { useAuth } from "@/hooks/useAuth";
import { fetchData, postDataJson } from "@/services/api";
import type { User, StepsLog, AiImageAnalysis } from "@/types";
import { profileImageUrl, displayName, DEPARTMENTS } from "@/utils/personnel";

const thaiShortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function toThaiYear(date: Date): string { return String(date.getFullYear()+543); }
function formatThaiDateShort(date: Date): string { return `${date.getDate()} ${thaiShortMonths[date.getMonth()]} ${toThaiYear(date)}`; }
function getMonday(d: Date): Date { const date=new Date(d); const day=date.getDay(); const diff=date.getDate()-day+(day===0?-6:1); date.setDate(diff); date.setHours(0,0,0,0); return date;}
function getSunday(d: Date): Date { const sun=new Date(getMonday(d)); sun.setDate(sun.getDate()+6); return sun;}
function toIsoLocal(d: Date): string { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`;}
function formatWeekRangeThai(d: Date): string { const mon=getMonday(d); const sun=getSunday(d); return `${formatThaiDateShort(mon)} - ${formatThaiDateShort(sun)}`; }
function normalizeDateKey(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) return toIsoLocal(value);
  const s=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dd=new Date(s); if(!isNaN(dd.getTime())) return toIsoLocal(dd); return s;
}
function compressImage(file: File, maxDim=1600, quality=0.85): Promise<string> {
  return new Promise((resolve, reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let {width,height}=img;
        if(width>maxDim||height>maxDim){ const r=Math.min(maxDim/width,maxDim/height); width=Math.round(width*r); height=Math.round(height*r); }
        const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext('2d'); if(!ctx){reject(new Error('เบราว์เซอร์ไม่รองรับการย่อภาพ')); return;}
        ctx.drawImage(img,0,0,width,height); resolve(canvas.toDataURL('image/jpeg',quality));
      };
      img.onerror=()=>reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      img.src=reader.result as string;
    };
    reader.onerror=()=>reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

type CellKey = string; // `${userId}|${dateIso}`
interface CellData {
  file: File | null;
  preview: string | null; // base64 dataUrl
  aiResult: AiImageAnalysis | null;
  manualSteps: string; // editable
  status: 'empty' | 'pending' | 'ai_done' | 'ready' | 'existing';
  existingLog?: StepsLog | null;
  notesOverride?: string;
}

export default function BatchStepsPage(){
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stepsData, setStepsData] = useState<StepsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(()=> toIsoLocal(getMonday(new Date())));
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [cells, setCells] = useState<Record<CellKey, CellData>>({});
  const [aiProcessing, setAiProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [resultPopup, setResultPopup] = useState<{type:'success'|'error', title:string, message:string}|null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const weekMonday = useMemo(()=> getMonday(new Date(weekStart)),[weekStart]);
  const weekDays: string[] = useMemo(()=> {
    return Array.from({length:7},(_,i)=>{ const d=new Date(weekMonday); d.setDate(d.getDate()+i); return toIsoLocal(d); });
  },[weekMonday]);
  const weekDaysLabel = useMemo(()=> weekDays.map(d=>{ const dt=new Date(d); return `${['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'][dt.getDay()===0?6:dt.getDay()-1]} ${formatThaiDateShort(dt)}`; }),[weekDays]);

  useEffect(()=>{
    if(user?.Department) setDeptFilter(user.Department);
  },[user?.Department]);

  async function load(){
    setLoading(true);
    const [u,s] = await Promise.all([fetchData<User[]>('users'), fetchData<StepsLog[]>('steps')]);
    if(u) setUsers(u);
    if(s) setStepsData(s);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  // existing approved per user per date
  const existingMap = useMemo(()=>{
    const map=new Map<string, StepsLog>();
    const latest = new Map<string, StepsLog>();
    // keep latest per date
    for(const log of stepsData){
      const key = `${String(log.User_ID)}|${normalizeDateKey(log.Date_Thai)}`;
      const cur=latest.get(key);
      if(!cur || String(log.Recorded_At||'') >= String(cur.Recorded_At||'')) latest.set(key, log);
    }
    // only Approved considered as existing (to block duplicate)
    for(const [k,v] of latest){
      if(String(v.Status)==='Approved') map.set(k, v);
    }
    return map;
  },[stepsData]);

  const filteredUsers = useMemo(()=>{
    let list = users;
    if(deptFilter) list = list.filter(u=>u.Department===deptFilter);
    if(search.trim()){
      const q=search.toLowerCase();
      list=list.filter(u=> `${u.Full_Name} ${u.First_Name} ${u.Last_Name} ${u.Nickname}`.toLowerCase().includes(q));
    }
    // sort: Mode2 first, then name
    return [...list].sort((a,b)=>{
      const ma=String(a.Step_Record_Mode||'1')==='2'?0:1;
      const mb=String(b.Step_Record_Mode||'1')==='2'?0:1;
      if(ma!==mb) return ma-mb;
      return String(a.Full_Name||'').localeCompare(String(b.Full_Name||''),'th');
    });
  },[users, deptFilter, search]);

  // count helpers
  const mode2Count = filteredUsers.filter(u=>String(u.Step_Record_Mode||'1')==='2').length;

  // when week changes, reset cells? Keep but clear aiResults? Better keep but check existing.
  // Do not auto clear.

  function cellKey(userId:string, dateIso:string){ return `${userId}|${dateIso}`; }

  function getCell(userId:string, dateIso:string): CellData {
    const key=cellKey(userId,dateIso);
    return cells[key] || { file:null, preview:null, aiResult:null, manualSteps:'', status:'empty', existingLog: existingMap.get(key)||null };
  }

  async function handleFileChange(userId:string, dateIso:string, file: File | null){
    const key=cellKey(userId,dateIso);
    if(!file){
      setCells(prev=>{ const n={...prev}; delete n[key]; return n; });
      return;
    }
    // check existing and not allowOverwrite
    const existing = existingMap.get(key);
    if(existing && !allowOverwrite){
      setResultPopup({type:'error', title:'วันที่นี้บันทึกแล้ว', message:`${displayName(users.find(u=>String(u.User_ID)===userId)||null)} วันที่ ${dateIso} มีข้อมูล Approved แล้ว (${Number(existing.Steps_Count).toLocaleString()} ก้าว) — หากต้องการแทนที่ กรุณาติ๊ก "อนุญาตแทนที่รายวันที่บันทึกแล้ว"`});
      return;
    }
    try{
      const preview = await compressImage(file);
      setCells(prev=>({
        ...prev,
        [key]: { file, preview, aiResult:null, manualSteps:'', status:'pending', existingLog: existingMap.get(key)||null }
      }));
    }catch(e){
      setResultPopup({type:'error', title:'อ่านรูปไม่สำเร็จ', message: e instanceof Error? e.message:'อ่านไฟล์รูปไม่สำเร็จ'});
    }
  }

  function removeCell(userId:string, dateIso:string){
    const key=cellKey(userId,dateIso);
    setCells(prev=>{ const n={...prev}; delete n[key]; return n; });
    const ref=fileRefs.current[key]; if(ref) ref.value='';
  }

  // AI processing for all pending cells
  async function handleAiProcess(){
    const pendingEntries = Object.entries(cells).filter(([,v])=> v.file && v.preview && v.status==='pending');
    if(pendingEntries.length===0){
      setResultPopup({type:'error', title:'ไม่มีรูปให้ประมวลผล', message:'กรุณาอัปโหลดรูปอย่างน้อย 1 รูปก่อนกดปุ่ม AI ประมวลผล'});
      return;
    }
    // validate per person max 7 per week (should be natural as 7 columns, but check)
    const perUserCount: Record<string, number> = {};
    for(const [k] of pendingEntries){
      const uid=k.split('|')[0];
      perUserCount[uid]=(perUserCount[uid]||0)+1;
      if(perUserCount[uid]>7){
        setResultPopup({type:'error', title:'เกินจำนวนที่กำหนด', message:`บุคลากรคนหนึ่งอัปโหลดได้สูงสุด 7 ภาพ (7 วัน) ต่อสัปดาห์`});
        return;
      }
    }
    setAiProcessing(true);
    try{
      // prepare images payload
      const images = pendingEntries.map(([key, cell])=>{
        const dateIso = key.split('|')[1];
        return { imageBase64: cell.preview!, expectedDate: dateIso };
      });
      const res = await fetch('/api/steps/batch-analyze', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ images })
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||'AI ประมวลผลล้มเหลว');
      const results: AiImageAnalysis[] = data.results || [];
      // map results back to cells
      setCells(prev=>{
        const next={...prev};
        pendingEntries.forEach(([key], idx)=>{
          const r = results[idx];
          if(!r) return;
          const cur = next[key];
          if(!cur) return;
          // Determine steps value: use r.steps if available, else keep empty
          // Add note about date mismatch handling
          let notes = r.notes || '';
          if(r.dateMatch===false){
            notes = (notes? notes+' | ':'') + 'AI พบว่าวันที่ในภาพไม่ตรงกับวันที่คาดหวัง — ระบบจะบันทึกลงวันที่ที่เลือกในตาราง โดยมีหมายเหตุว่า จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง';
          } else if(r.dateMatch===null){
            notes = (notes? notes+' | ':'') + 'ไม่พบวันที่ชัดเจนในภาพ / อ่านวันที่ไม่ชัดเจน — AI จะบันทึกตามวันที่คาดหวังของตาราง พร้อมหมายเหตุว่า จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง';
          }
          const withNotes = { ...r, notes } as AiImageAnalysis;
          next[key] = {
            ...cur,
            aiResult: withNotes,
            manualSteps: r.steps != null ? String(r.steps) : '',
            status: 'ai_done'
          };
        });
        return next;
      });
    }catch(err){
      setResultPopup({type:'error', title:'AI ประมวลผลล้มเหลว', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{
      setAiProcessing(false);
    }
  }

  const readyCells = useMemo(()=>{
    return Object.entries(cells).filter(([,c])=> (c.aiResult || c.manualSteps) && c.preview);
  },[cells]);

  async function handleSave(){
    setConfirmSave(false);
    if(!user) return;
    if(readyCells.length===0){
      setResultPopup({type:'error', title:'ไม่มีข้อมูลพร้อมบันทึก', message:'กรุณาอัปโหลดรูปและให้ AI ประมวลผลก่อน'});
      return;
    }
    // validate steps >0
    for(const [key, cell] of readyCells){
      const stepsNum = parseInt(cell.manualSteps||String(cell.aiResult?.steps||''),10);
      if(!stepsNum || stepsNum<=0){
        const uid=key.split('|')[0]; const dateIso=key.split('|')[1];
        setResultPopup({type:'error', title:'จำนวนก้าวไม่ถูกต้อง', message:`${displayName(users.find(u=>String(u.User_ID)===uid)||null)} วันที่ ${dateIso} — กรุณาใส่จำนวนก้าวที่มากกว่า 0`});
        return;
      }
    }

    setSaving(true);
    try{
      const payloadSteps = readyCells.map(([key, cell])=>{
        const [uid, dateIso]=key.split('|');
        const stepsNum = parseInt(cell.manualSteps||String(cell.aiResult?.steps||''),10);
        const r = cell.aiResult;
        // Notes handling for unclear date
        let notes = r?.notes || '';
        if(r?.dateMatch===null || r?.dateMatch===false){
          if(!notes.includes('จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง')){
            notes = (notes? notes+' ':'') + '(หมายเหตุ: จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง)';
          }
        }
        return {
          User_ID: uid,
          Day: dateIso,
          Steps_Count: stepsNum,
          Image_Base64: cell.preview!,
          AI_Steps: r?.steps ?? '',
          AI_Confidence: r?.confidence ?? '',
          Date_In_Image: r?.dateInImage ?? '',
          Date_Match: r?.dateMatch===true ? 'TRUE' : r?.dateMatch===false ? 'FALSE' : '',
          Alert_Flag: r?.alert ? 'TRUE' : 'FALSE',
          Alert_Reason: r?.alertReasons ? r.alertReasons.join('; ') : '',
          Notes: notes
        };
      });

      const res = await fetch('/api/steps/batch-upload', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ Logged_By: user.User_ID, Week_Start: weekStart, Allow_Overwrite: allowOverwrite ? '1' : '0', Steps: payloadSteps })
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || data.error) throw new Error(data.error||'บันทึกไม่สำเร็จ');

      // data may contain saved/skipped/errors details from GAS
      const saved = data.saved ?? payloadSteps.length;
      const skipped = data.skipped ?? 0;
      const errors = data.errors ?? 0;
      let msg = data.message || `บันทึกสำเร็จ ${saved} รายการ`;
      if(skipped>0) msg += ` (ข้าม ${skipped} รายการที่ซ้ำ)`;
      if(errors>0) msg += ` (ผิดพลาด ${errors} รายการ)`;

      setResultPopup({type:'success', title:'บันทึกสำเร็จ', message: msg});
      // clear saved cells
      setCells(prev=>{
        const next={...prev};
        for(const [k] of readyCells) delete next[k];
        return next;
      });
      // reload steps
      const s = await fetchData<StepsLog[]>('steps');
      if(s) setStepsData(s);
    }catch(err){
      setResultPopup({type:'error', title:'บันทึกไม่สำเร็จ', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{
      setSaving(false);
    }
  }

  // for day header display existing count
  const existingCountForWeek = useMemo(()=>{
    let cnt=0;
    for(const d of weekDays){
      for(const u of filteredUsers){
        if(existingMap.has(`${String(u.User_ID)}|${d}`)) cnt++;
      }
    }
    return cnt;
  },[filteredUsers, weekDays, existingMap]);

  if(loading){
    return <div className="flex items-center justify-center py-20"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">บันทึกนับก้าวแบบกลุ่ม (เจ้าหน้าที่ นสส.)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">อัปโหลดรูปหลักฐานได้สูงสุดครั้งละ 7 ภาพ (7 วัน) ต่อคน ต่อสัปดาห์ — แถว = คน, คอลัมน์ = วัน — กดปุ่ม &quot;AI ประมวลผล&quot; เพื่ออ่านจำนวนก้าวและวันที่</p>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl border">
          <span className="font-bold text-emerald-700 dark:text-emerald-400">ฝ่ายของคุณ:</span> {user?.Department || '—'} {mode2Count>0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-bold">Mode 2: {mode2Count} คน</span>}
        </div>
      </div>

      {/* Controls */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">สัปดาห์:</span>
            <button onClick={()=>{
              const prev=new Date(weekStart); prev.setDate(prev.getDate()-7); setWeekStart(toIsoLocal(prev));
            }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600"><span className="material-symbols-outlined text-base">chevron_left</span></button>
            <input type="date" value={weekStart} onChange={e=>{
              if(e.target.value){ const m=getMonday(new Date(e.target.value)); setWeekStart(toIsoLocal(m)); }
            }} className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700" />
            <button onClick={()=>{
              const next=new Date(weekStart); next.setDate(next.getDate()+7); setWeekStart(toIsoLocal(next));
            }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600"><span className="material-symbols-outlined text-base">chevron_right</span></button>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">{formatWeekRangeThai(weekMonday)} ({formatThaiDateShort(getSunday(weekMonday))})</span>
          </div>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />
          <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
            <option value="">ทุกส่วนราชการ</option>
            {DEPARTMENTS.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อ..." className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm flex-1 min-w-[140px]" />
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={allowOverwrite} onChange={e=>setAllowOverwrite(e.target.checked)} className="checkbox checkbox-xs" />
            อนุญาตแทนที่รายวันที่บันทึกแล้ว
          </label>
          <span className="text-xs text-gray-400 hidden lg:inline">สัปดาห์นี้บันทึกแล้ว {existingCountForWeek} รายการ (Approved)</span>
        </div>
        <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          <span className="font-bold flex items-center gap-1"><span className="material-symbols-outlined text-sm">info</span> เงื่อนไขการบันทึก:</span>
          • หากสัปดาห์นั้นบันทึกไปแล้ว 1-6 วัน สามารถบันทึกวันที่เหลือได้ แต่จะไม่ให้บันทึกซ้ำในวันที่บันทึกไปแล้ว (ข้ามอัตโนมัติ) — หากต้องการแทนที่ ให้ติ๊ก “อนุญาตแทนที่” แล้วอัปโหลดใหม่ของวันนั้น<br/>
          • หากภาพไม่แสดงวันที่หรือระบุไม่ชัดเจน AI จะเลือกวันที่ที่เหมาะสมและใส่หมายเหตุว่า “จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง” • สัปดาห์บันทึกแล้วเต็ม 7 วัน จะไม่สามารถเพิ่มได้อีก
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <th className="px-3 py-3 font-semibold sticky left-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur z-10 min-w-[200px] text-left">บุคลากร (แถว = คน)</th>
                {weekDays.map((d,i)=> (
                  <th key={d} className="px-2 py-3 font-semibold text-center min-w-[150px]">
                    <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{weekDaysLabel[i]}</div>
                    <div className="text-[10px] font-normal text-gray-400">{d}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.length===0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">ไม่พบข้อมูลบุคลากร (ลองเปลี่ยนตัวกรองฝ่าย หรือตรวจสอบว่าบุคลากรถูกตั้งเป็น Mode 2)</td></tr>
              ) : filteredUsers.map(u=>{
                const uid=String(u.User_ID||'');
                const isMode2 = String(u.Step_Record_Mode||'1')==='2';
                const name = displayName(u);
                return (
                  <tr key={uid||u.Personnel_ID} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${!uid? 'opacity-60':''} ${!isMode2 ? 'bg-amber-50/20 dark:bg-amber-900/5':''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2.5">
                        {u.Profile_Image ? <img src={profileImageUrl(u.Profile_Image)||''} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-emerald-200 dark:ring-emerald-800 shrink-0" /> : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">{(u.Full_Name||u.First_Name||'ส').charAt(0)}</div>}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate max-w-[140px]" title={name}>{name}</div>
                          <div className="text-[11px] text-gray-400 truncate">{u.Department}</div>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border mt-0.5 ${isMode2 ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200'}`}>
                            {isMode2? 'Mode 2':'Mode 1: บันทึกเอง'}
                          </span>
                          {!uid && <div className="text-[10px] text-red-400">ยังไม่ลงทะเบียน (ไม่มี User_ID)</div>}
                        </div>
                      </div>
                    </td>
                    {weekDays.map(dateIso=>{
                      const key=cellKey(uid, dateIso);
                      const cell=getCell(uid, dateIso);
                      const hasExisting = existingMap.has(key);
                      const existing = existingMap.get(key);
                      const hasUpload = !!cell.preview;
                      const ai = cell.aiResult;
                      return (
                        <td key={dateIso} className="px-2 py-2 align-top">
                          {hasExisting && !hasUpload ? (
                            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{Number(existing?.Steps_Count||0).toLocaleString()} ก้าว</div>
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400">บันทึกแล้ว</div>
                              <div className="text-[10px] text-gray-400">{existing?.Record_Method || 'Approved'}</div>
                              {!allowOverwrite && <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">ล็อก (เปิด "อนุญาตแทนที่" เพื่อแทนที่)</div>}
                              {allowOverwrite && (
                                <label className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-gray-800 border text-[11px] font-medium cursor-pointer hover:bg-gray-50">
                                  <span className="material-symbols-outlined text-sm">upload</span> แทนที่
                                  <input type="file" accept="image/*" className="hidden" ref={el=>{ fileRefs.current[key]=el; }} onChange={e=>{
                                    const f=e.target.files?.[0]||null; if(f) handleFileChange(uid, dateIso, f);
                                  }} />
                                </label>
                              )}
                            </div>
                          ) : hasUpload ? (
                            <div className="p-2 rounded-xl border-2 bg-white dark:bg-gray-800 space-y-1.5" style={{borderColor: ai ? (ai.alert? '#fca5a5':'#a7f3d0'):'#e5e7eb'}}>
                              <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                <img src={cell.preview!} alt="preview" className="w-full h-20 object-cover" />
                                <button onClick={()=>removeCell(uid,dateIso)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600" title="ลบรูป">
                                  <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                                {hasExisting && <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-bold">แทนที่ {Number(existing?.Steps_Count||0).toLocaleString()}</span>}
                              </div>
                              {ai ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-gray-500">AI อ่าน:</span>
                                    <span className="text-xs font-black text-purple-600 dark:text-purple-400">{ai.steps!=null? ai.steps.toLocaleString():'—'}</span>
                                  </div>
                                  <input value={cell.manualSteps} onChange={e=>{
                                    const v=e.target.value; setCells(prev=>({...prev, [key]:{...prev[key]!, manualSteps:v}}));
                                  }} type="number" placeholder="จำนวนก้าว" className="w-full px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-center" />
                                  <div className="text-[10px] leading-tight">
                                    {ai.dateMatch===true ? <span className="text-emerald-600">✓ วันที่ตรงกัน {ai.dateInImage||''}</span> : ai.dateMatch===false ? <span className="text-red-600">⚠ วันที่ไม่ตรง ({ai.dateInImage||'—'}) → บันทึกลง {dateIso} มีหมายเหตุ</span> : <span className="text-amber-600">? ไม่พบวันที่ → บันทึกลง {dateIso} มีหมายเหตุ</span>}
                                  </div>
                                  {ai.notes && <div className="text-[10px] text-gray-500 bg-gray-50 dark:bg-gray-700/40 p-1 rounded">{ai.notes.slice(0,180)}</div>}
                                  {ai.alert && <div className="text-[10px] text-red-600 bg-red-50 dark:bg-red-900/20 p-1 rounded">{ai.alertReasons.join('; ').slice(0,150)}</div>}
                                  <div className="text-[10px] text-gray-400">มั่นใจ {Math.round((ai.confidence||0)*100)}% • แก้ไขก้าวได้ก่อนบันทึก</div>
                                </div>
                              ) : (
                                <div className="text-[11px] text-gray-500 text-center py-1">รอ AI ประมวลผล<br/><span className="text-[10px] text-gray-400">กดปุ่มด้านล่าง</span></div>
                              )}
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 border-dashed cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all min-h-[90px] ${!uid? 'opacity-40 pointer-events-none':''} ${!isMode2 ? 'border-amber-300 bg-amber-50/30':''}`}>
                              <span className="material-symbols-outlined text-gray-400">add_a_photo</span>
                              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">อัปโหลด</span>
                              <span className="text-[9px] text-gray-400">{dateIso.slice(5)}</span>
                              {!isMode2 && <span className="text-[9px] text-amber-600">Mode 1</span>}
                              <input type="file" accept="image/*" className="hidden" ref={el=>{ fileRefs.current[key]=el; }} onChange={e=>{
                                const f=e.target.files?.[0]||null; if(f) handleFileChange(uid, dateIso, f);
                              }} disabled={!uid || (!isMode2 && !allowOverwrite)} />
                            </label>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length>0 && (
          <div className="p-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              อัปโหลดแล้ว <strong className="text-emerald-600">{Object.keys(cells).length}</strong> รูป • รอ AI <strong className="text-amber-600">{Object.values(cells).filter(c=>c.status==='pending').length}</strong> • พร้อมบันทึก <strong className="text-purple-600">{readyCells.length}</strong>
              <span className="ml-2 text-[11px] text-gray-400">สูงสุด 7 รูปต่อคนต่อสัปดาห์ • ระบบจะข้ามวันที่บันทึกซ้ำอัตโนมัติ (เว้นแต่เปิดอนุญาตแทนที่)</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>{
                if(confirm('ล้างรูปที่อัปโหลดทั้งหมด?')) setCells({});
              }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-white dark:hover:bg-gray-700">ล้างทั้งหมด</button>
              <button onClick={handleAiProcess} disabled={aiProcessing || Object.values(cells).filter(c=>c.status==='pending').length===0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-lg hover:shadow-xl disabled:opacity-40 flex items-center gap-2">
                {aiProcessing ? <><span className="loading loading-spinner loading-xs"></span> กำลังประมวลผล...</> : <><span className="material-symbols-outlined text-lg">auto_awesome</span> AI ประมวลผล ({Object.values(cells).filter(c=>c.status==='pending').length} รูป)</>}
              </button>
              <button onClick={()=> setConfirmSave(true)} disabled={saving || readyCells.length===0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm shadow-lg hover:shadow-xl disabled:opacity-40 flex items-center gap-2">
                {saving ? <><span className="loading loading-spinner loading-xs"></span> กำลังบันทึก...</> : <><span className="material-symbols-outlined">save</span> บันทึกทั้งหมด ({readyCells.length})</>}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      <ConfirmPopup
        open={confirmSave}
        title="ยืนยันบันทึกแบบกลุ่ม"
        message={`คุณกำลังจะบันทึก ${readyCells.length} รายการ วันที่สัปดาห์ ${formatWeekRangeThai(weekMonday)} — รายการที่ซ้ำจะถูกข้ามอัตโนมัติ แต่หากเปิด "อนุญาตแทนที่" จะบันทึกทับวันที่นั้น แน่ใจหรือไม่?`}
        variant="primary"
        loading={saving}
        onConfirm={handleSave}
        onClose={()=> setConfirmSave(false)}
      />
      {resultPopup && (
        <ResultPopup
          open={!!resultPopup}
          type={resultPopup.type}
          title={resultPopup.title}
          message={resultPopup.message}
          confirmLabel="ตกลง"
          onClose={()=> setResultPopup(null)}
        />
      )}
    </div>
  );
}
