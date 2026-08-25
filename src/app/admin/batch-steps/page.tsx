'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import GlassCard from "@/components/ui/GlassCard";
import ConfirmPopup from "@/components/ui/ConfirmPopup";
import ResultPopup from "@/components/ui/ResultPopup";
import { useAuth } from "@/hooks/useAuth";
import { fetchData } from "@/services/api";
import type { User, StepsLog, AiImageAnalysis } from "@/types";
import { displayName } from "@/utils/personnel";

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
function getUserKey(u: User): string { return String((u as any).User_ID || u.Personnel_ID || '').trim(); }
function isPendingUser(u: User): boolean { return !String((u as any).User_ID || '').trim(); }

// กระจาย AI คนละโมเดลต่อคนแบบ round-robin เพื่อลด 429 และให้แต่ละคนวิ่งบนโมเดลของตัวเองจนครบ
type ProviderKey = 'gemini' | 'openrouter' | 'openrouter2';
const PROVIDERS: ProviderKey[] = ['gemini','openrouter','openrouter2'];
function hashUid(s: string): number { let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))|0; return Math.abs(h); }
function getProviderForUid(uid: string): ProviderKey { return PROVIDERS[hashUid(uid) % PROVIDERS.length]; }
function providerLabel(p: ProviderKey): string { return p==='gemini' ? 'Gemini' : p==='openrouter' ? 'ox-alpha' : 'Gemma-4-26b'; }
function providerBadgeClass(p: ProviderKey | string): string {
  if(p==='openrouter') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200';
  if(p==='openrouter2') return 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200';
  return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200';
}

interface FileItem {
  id: string;
  file: File;
  preview: string;
  aiResult: AiImageAnalysis | null;
  manualSteps: string;
  targetDate: string;
  isProcessing?: boolean;
}

export default function BatchStepsPage(){
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stepsData, setStepsData] = useState<StepsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(()=> toIsoLocal(getMonday(new Date())));
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [userFiles, setUserFiles] = useState<Record<string, FileItem[]>>({});
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState<{total:number, done:number, percent:number, currentUserName?:string, currentFileName?:string} | null>(null);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [resultPopup, setResultPopup] = useState<{type:'success'|'error', title:string, message:string}|null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [overwriteWarning, setOverwriteWarning] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // ตาราง 7 วัน: กรอกเลข + แนบภาพต่อวัน (hybrid)
  const [gridInputs, setGridInputs] = useState<Record<string, Record<string, string>>>({});
  const [gridImages, setGridImages] = useState<Record<string, Record<string, { preview:string, file: File }>>>({});
  const gridFileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const weekMonday = useMemo(()=> getMonday(new Date(weekStart)),[weekStart]);
  const weekDays: string[] = useMemo(()=> Array.from({length:7},(_,i)=>{ const d=new Date(weekMonday); d.setDate(d.getDate()+i); return toIsoLocal(d); }),[weekMonday]);
  const weekDaysLabel = useMemo(()=> weekDays.map(d=>{ const dt=new Date(d); const dow=['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'][dt.getDay()===0?6:dt.getDay()-1]; return `${dow} ${formatThaiDateShort(dt)}`; }),[weekDays]);

  // ล็อกฝ่าย: บันทึกได้เฉพาะฝ่ายของตนเองเท่านั้น — กันเปลี่ยนฝ่ายจาก UI / แทรกค่าผ่าน devtools
  const actorDepartment = useMemo(()=> String(user?.Department||'').trim(), [user?.Department]);
  useEffect(()=>{ if(actorDepartment) setDeptFilter(actorDepartment); },[actorDepartment]);

  async function load(){
    setLoading(true);
    const [u,s] = await Promise.all([fetchData<User[]>('users'), fetchData<StepsLog[]>('steps')]);
    if(u) setUsers(u);
    if(s) setStepsData(s);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  const existingMap = useMemo(()=>{
    const latest=new Map<string, StepsLog>();
    for(const log of stepsData){
      const key=`${String(log.User_ID)}|${normalizeDateKey(log.Date_Thai)}`;
      const cur=latest.get(key);
      if(!cur || String(log.Recorded_At||'') >= String(cur.Recorded_At||'')) latest.set(key, log);
    }
    const approved=new Map<string, StepsLog>();
    for(const [k,v] of latest){ if(String(v.Status)==='Approved') approved.set(k,v); }
    return approved;
  },[stepsData]);

  const filteredUsers = useMemo(()=>{
    // บังคับกรองเฉพาะฝ่ายของตนเองเท่านั้น — ต่อให้ deptFilter ถูกแก้ผ่าน devtools ก็ต้องยึด actorDepartment
    let list=users;
    if(actorDepartment) list=list.filter(u=> String(u.Department||'').trim()===actorDepartment);
    else list=[]; // ไม่มีฝ่าย = ไม่แสดงใคร เพื่อกันบันทึกข้ามฝ่าย
    if(search.trim()){
      const q=search.toLowerCase();
      list=list.filter(u=> `${u.Full_Name} ${u.First_Name} ${u.Last_Name} ${u.Nickname}`.toLowerCase().includes(q));
    }
    return [...list].sort((a,b)=>{
      const ma=String(a.Step_Record_Mode||'1')==='2'?0:1;
      const mb=String(b.Step_Record_Mode||'1')==='2'?0:1;
      if(ma!==mb) return ma-mb;
      return String(a.Full_Name||'').localeCompare(String(b.Full_Name||''),'th');
    });
  },[users, actorDepartment, search]);

  const mode2Count = filteredUsers.filter(u=>String(u.Step_Record_Mode||'1')==='2').length;

  function getExistingForUserWeek(userId:string){
    return weekDays.filter(d=> existingMap.has(`${userId}|${d}`)).map(d=> ({date:d, log: existingMap.get(`${userId}|${d}`)!}));
  }

  async function handleFilesForUser(userId:string, files: FileList | File[]){
    const arr = Array.from(files as FileList);
    const current = userFiles[userId] || [];
    if(current.length + arr.length > 7){
      setResultPopup({type:'error', title:'เกิน 7 ภาพต่อคนต่อสัปดาห์', message:`บุคลากร 1 คนอัปโหลดได้สูงสุด 7 ภาพ (7 วัน) ต่อสัปดาห์ — ตอนนี้มี ${current.length} ภาพแล้ว จะเพิ่มอีก ${arr.length} ภาพเกินกำหนด`});
      return;
    }
    const targetUser = users.find(u=> getUserKey(u)===userId);
    if(!userId){
      setResultPopup({type:'error', title:'ไม่พบบุคลากร', message:'ไม่พบรหัสบุคลากร (Personnel_ID/User_ID) ไม่สามารถบันทึกได้'});
      return;
    }
    // ยอมให้ Pending (ยังไม่ลงทะเบียน) ประมวลผลได้เช่นเดียวกัน — จะบันทึกด้วย Personnel_ID แล้ว migrate เมื่อลงทะเบียน
    if(targetUser && !isPendingUser(targetUser) && String(targetUser.Step_Record_Mode||'1')!=='2' && !allowOverwrite){
      setResultPopup({type:'error', title:'Mode ไม่ถูกต้อง', message:`${displayName(targetUser)} อยู่ใน Mode 1 (บันทึกเอง) — หากต้องการให้ จนท. บันทึกให้ กรุณาเปลี่ยนเป็น Mode 2 ที่หน้าจัดการบุคลากรก่อน หรือติ๊ก "อนุญาตให้บันทึกแม้เป็น Mode 1"`});
    }
    const newItems: FileItem[] = [];
    for(let i=0;i<arr.length;i++){
      const f=arr[i];
      if(!f.type.startsWith('image/')) continue;
      try{
        const preview = await compressImage(f);
        const usedTargets = new Set([...current, ...newItems].map(x=>x.targetDate));
        let defaultDate = weekDays.find(d=> !usedTargets.has(d) && (allowOverwrite || !existingMap.has(`${userId}|${d}`))) || weekDays.find(d=> !usedTargets.has(d)) || weekDays[0];
        newItems.push({ id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2,6)}`, file:f, preview, aiResult:null, manualSteps:'', targetDate: defaultDate });
      }catch(e){
        setResultPopup({type:'error', title:'อ่านรูปไม่สำเร็จ', message: e instanceof Error? e.message:'อ่านไฟล์รูปไม่สำเร็จ'});
      }
    }
    setUserFiles(prev=> ({...prev, [userId]: [...current, ...newItems]}));
  }

  function removeFile(userId:string, fileId:string){
    setUserFiles(prev=>{
      const arr = (prev[userId]||[]).filter(f=> f.id!==fileId);
      const next={...prev};
      if(arr.length===0) delete next[userId];
      else next[userId]=arr;
      return next;
    });
    const ref=fileInputRefs.current[userId];
    if(ref) ref.value='';
  }

  function updateFile(userId:string, fileId:string, patch: Partial<FileItem>){
    setUserFiles(prev=>{
      const arr=prev[userId]||[];
      return {...prev, [userId]: arr.map(f=> f.id===fileId? {...f, ...patch}: f)};
    });
  }

  // คำนวณ targetDate ที่ว่างสำหรับผล AI ต่อไฟล์แบบทันที
  function pickTargetDateForResult(userId:string, dateInImage: string | null, usedInBatch: Set<string>){
    const used = new Set<string>(usedInBatch);
    if(!allowOverwrite){
      for(const d of weekDays){ if(existingMap.has(`${userId}|${d}`)) used.add(d); }
    }
    // ถ้า dateInImage อยู่ในสัปดาห์และยังว่าง → ใช้เลย
    if(dateInImage && weekDays.includes(dateInImage) && !used.has(dateInImage)){
      return dateInImage;
    }
    // หาวันว่างแรก
    const free = weekDays.find(d=> !used.has(d));
    if(free) return free;
    // ถ้าเต็มหมดแล้ว ให้ใช้วันแรกที่ซ้ำน้อยสุด (allowOverwrite)
    return weekDays.find(d=> !usedInBatch.has(d)) || weekDays[0];
  }

  async function handleAiForUser(userId:string){
    const items = userFiles[userId]||[];
    const pending = items.filter(f=> !f.aiResult);
    if(pending.length===0){
      setResultPopup({type:'error', title:'ไม่มีรูปที่รอประมวลผล', message:'กรุณาอัปโหลดรูปก่อน'});
      return;
    }
    const targetUser = users.find(u=> String(u.User_ID)===userId || String((u as any).Personnel_ID)===userId);
    const userName = targetUser ? displayName(targetUser) : userId;
    // AI คนละตัวต่อคน — ล็อคคนนี้กับโมเดลเดียวแล้ววนจนครบทุกภาพของคนนี้
    const providerForThisUser: ProviderKey = getProviderForUid(userId);
    setAiProcessing(true);
    setProcessingUserId(userId);
    setAiProgress({total: pending.length, done: 0, percent: 0, currentUserName: `${userName} [${providerLabel(providerForThisUser)}]`});
    const usedInBatch = new Set<string>();
    // mark already processed files' targetDate as used
    for(const f of items){ if(f.aiResult) usedInBatch.add(f.targetDate); }
    if(!allowOverwrite){
      for(const d of weekDays){ if(existingMap.has(`${userId}|${d}`)) usedInBatch.add(d); }
    }
    try{
      for(let idx=0; idx<pending.length; idx++){
        const fileItem = pending[idx];
        // mark processing
        setUserFiles(prev=>{
          const arr=[...(prev[userId]||[])];
          return {...prev, [userId]: arr.map(f=> f.id===fileItem.id? {...f, isProcessing:true}: f)};
        });
        setAiProgress({total: pending.length, done: idx, percent: Math.round((idx/pending.length)*100), currentUserName: `${userName} [${providerLabel(providerForThisUser)}]`, currentFileName: fileItem.file.name});
        // call single image analyze — ส่ง preferredProvider เพื่อให้คนนี้วิ่งบน AI ตัวเดียวตลอด
        const res = await fetch('/api/steps/image-analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: fileItem.preview, expectedDate: fileItem.targetDate, preferredProvider: providerForThisUser }) });
        const data = await res.json().catch(()=>({}));
        if(!res.ok){
          throw new Error(data.error||'AI ประมวลผลล้มเหลว');
        }
        const r: AiImageAnalysis = {
          steps: data.steps ?? null,
          dateInImage: data.dateInImage ?? null,
          dateRaw: data.dateRaw ?? null,
          dateMatch: data.dateMatch ?? null,
          confidence: data.confidence ?? 0,
          notes: data.notes ?? '',
          alert: !!data.alert,
          alertReasons: data.alertReasons ?? [],
          provider: (data.provider as any) ?? 'gemini',
          model: data.model ?? (data.provider==='openrouter' ? 'stealth/ox-alpha' : 'gemini-3.6-flash'),
        };
        const targetDate = pickTargetDateForResult(userId, r.dateInImage, usedInBatch);
        usedInBatch.add(targetDate);
        let notes=r.notes||'';
        if(r.dateMatch===false) notes=(notes?notes+' | ':'')+'AI พบวันที่ในภาพไม่ตรงกับวันที่คาดหวัง — บันทึกลง '+targetDate+' โดยมีหมายเหตุว่า จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง';
        else if(r.dateMatch===null) notes=(notes?notes+' | ':'')+'ไม่พบวันที่ชัดเจนในภาพ — AI บันทึกลง '+targetDate+' พร้อมหมายเหตุว่า จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง';
        const withNotes={...r, notes} as AiImageAnalysis;
        setUserFiles(prev=>{
          const arr=[...(prev[userId]||[])];
          return {...prev, [userId]: arr.map(f=> f.id===fileItem.id? {...f, aiResult:withNotes, manualSteps: r.steps!=null? String(r.steps): f.manualSteps, targetDate, isProcessing:false}: f)};
        });
        setAiProgress({total: pending.length, done: idx+1, percent: Math.round(((idx+1)/pending.length)*100), currentUserName: userName, currentFileName: fileItem.file.name});
      }
    }catch(err){
      setResultPopup({type:'error', title:'AI ประมวลผลล้มเหลว', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
      // clear processing flag
      setUserFiles(prev=>{
        const arr=[...(prev[userId]||[])];
        return {...prev, [userId]: arr.map(f=> ({...f, isProcessing:false}))};
      });
    }finally{
      setAiProcessing(false);
      setProcessingUserId(null);
      setTimeout(()=> setAiProgress(null), 800);
    }
  }

  async function handleAiAll(){
    const pendingUsers = filteredUsers.filter(u=>{
      const uid=getUserKey(u);
      const arr=userFiles[uid]||[];
      return arr.some(f=> !f.aiResult);
    });
    const totalPending = pendingUsers.reduce((sum,u)=> sum + (userFiles[getUserKey(u)]||[]).filter(f=>!f.aiResult).length, 0);
    if(totalPending===0){
      setResultPopup({type:'error', title:'ไม่มีรูปให้ประมวลผล', message:'กรุณาอัปโหลดรูปอย่างน้อย 1 รูปในตาราง (1 ช่อง/คน, สูงสุด 7 ภาพ/คน) ก่อนกดปุ่ม AI ประมวลผล' });
      return;
    }
    setAiProcessing(true);
    const globalDoneRef = { value: 0 };
    setAiProgress({total: totalPending, done: 0, percent: 0, currentUserName: 'เริ่มต้น...'});
    const updateGlobalProgress = (userName:string, fileName:string) => {
      setAiProgress({total: totalPending, done: globalDoneRef.value, percent: Math.round((globalDoneRef.value/totalPending)*100), currentUserName: userName, currentFileName: fileName});
    };
    try{
      const CONCURRENCY = 6; // ประมวลผลพร้อมกัน 6 คน แต่ละคนล็อค AI ของตัวเอง → กระจายโหลด 3 โมเดล (เฉลี่ยโมเดลละ 2 คนขนาน)
      // จัดสรร AI แบบ round-robin ตามลำดับคิว — คนที่ 0:Gemini, 1:ox-alpha, 2:Gemma, วนลูป
      const providerForIndex = (idx: number): ProviderKey => PROVIDERS[idx % PROVIDERS.length];
      const processOneUser = async (u: User, globalIndex: number) => {
        const uid=getUserKey(u);
        const pending = (userFiles[uid]||[]).filter(f=> !f.aiResult);
        if(pending.length===0) return;
        const userName=displayName(u);
        const assignedProvider = providerForIndex(globalIndex);
        const usedInBatch = new Set<string>();
        for(const f of (userFiles[uid]||[])){ if(f.aiResult) usedInBatch.add(f.targetDate); }
        if(!allowOverwrite){ for(const d of weekDays){ if(existingMap.has(`${uid}|${d}`)) usedInBatch.add(d); } }
        for(let idx=0; idx<pending.length; idx++){
          const fileItem = pending[idx];
          setUserFiles(prev=>{ const arr=[...(prev[uid]||[])]; return {...prev, [uid]: arr.map(f=> f.id===fileItem.id? {...f, isProcessing:true}: f)}; });
          updateGlobalProgress(`${userName} [${providerLabel(assignedProvider)}]`, fileItem.file.name);
          const res = await fetch('/api/steps/image-analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: fileItem.preview, expectedDate: fileItem.targetDate, preferredProvider: assignedProvider }) });
          const data = await res.json().catch(()=>({}));
          if(!res.ok) throw new Error(data.error||'AI ประมวลผลล้มเหลว');
          const r: AiImageAnalysis = {
            steps: data.steps ?? null,
            dateInImage: data.dateInImage ?? null,
            dateRaw: data.dateRaw ?? null,
            dateMatch: data.dateMatch ?? null,
            confidence: data.confidence ?? 0,
            notes: data.notes ?? '',
            alert: !!data.alert,
            alertReasons: data.alertReasons ?? [],
            provider: (data.provider as any) ?? 'gemini',
            model: data.model ?? (data.provider==='openrouter' ? 'stealth/ox-alpha' : 'gemini-3.6-flash'),
          };
          const targetDate = pickTargetDateForResult(uid, r.dateInImage, usedInBatch);
          usedInBatch.add(targetDate);
          let notes=r.notes||'';
          if(r.dateMatch===false) notes=(notes?notes+' | ':'')+'AI พบวันที่ไม่ตรง — บันทึกลง '+targetDate+' พร้อมหมายเหตุรวมสัปดาห์ถูกต้อง';
          else if(r.dateMatch===null) notes=(notes?notes+' | ':'')+'ไม่พบวันที่ — บันทึกลง '+targetDate+' พร้อมหมายเหตุรวมสัปดาห์ถูกต้อง';
          const withNotes={...r, notes} as AiImageAnalysis;
          setUserFiles(prev=>{ const arr=[...(prev[uid]||[])]; return {...prev, [uid]: arr.map(f=> f.id===fileItem.id? {...f, aiResult:withNotes, manualSteps: r.steps!=null? String(r.steps): f.manualSteps, targetDate, isProcessing:false}: f)}; });
          globalDoneRef.value++;
          updateGlobalProgress(userName, fileItem.file.name);
        }
      };
      for(let i=0; i<pendingUsers.length; i+=CONCURRENCY){
        const batch = pendingUsers.slice(i, i+CONCURRENCY);
        setProcessingUserId(getUserKey(batch[0]));
        await Promise.all(batch.map((u, bi) => processOneUser(u, i + bi)));
      }
    }catch(err){
      setResultPopup({type:'error', title:'AI ประมวลผลล้มเหลว', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{
      setAiProcessing(false);
      setProcessingUserId(null);
      setTimeout(()=> setAiProgress(null), 800);
    }
  }

  const totalFiles = useMemo(()=> Object.values(userFiles).reduce((s,a)=>s+a.length,0),[userFiles]);
  const totalPending = useMemo(()=> Object.values(userFiles).reduce((s,a)=>s+a.filter(f=>!f.aiResult).length,0),[userFiles]);
  const totalReady = useMemo(()=> Object.values(userFiles).reduce((s,a)=>s+a.filter(f=> f.aiResult || f.manualSteps).length,0),[userFiles]);

  async function handleSave(){
    setConfirmSave(false);
    if(!user) return;
    if(!actorDepartment){
      setResultPopup({type:'error', title:'ไม่พบฝ่ายของคุณ', message:'บัญชีของคุณไม่มีข้อมูลฝ่าย/ส่วนราชการ — ไม่สามารถบันทึกได้ กรุณาติดต่อผู้ดูแลระบบ'});
      return;
    }
    // ตรวจข้ามฝ่ายก่อนทุกอย่าง: ถ้ามี uid ที่ไม่อยู่ฝ่ายตนเองให้บล็อกทันที (กันแก้ไข deptFilter / ส่งข้อมูลดัก)
    const userDeptByKey = new Map<string,string>();
    for(const u of users){
      const k=getUserKey(u);
      if(k) userDeptByKey.set(k, String(u.Department||'').trim());
      const pid=String((u as any).Personnel_ID||'').trim();
      if(pid && !userDeptByKey.has(pid)) userDeptByKey.set(pid, String(u.Department||'').trim());
    }
    const crossDeptUids = new Set<string>();
    for(const uid of Object.keys(userFiles)){
      if(userDeptByKey.get(uid)!==actorDepartment) crossDeptUids.add(uid);
    }
    for(const uid of Object.keys(gridInputs)){
      const hasAny = Object.values(gridInputs[uid]||{}).some(v=> parseInt(String(v||''),10)>0);
      if(hasAny && userDeptByKey.get(uid)!==actorDepartment) crossDeptUids.add(uid);
    }
    for(const uid of Object.keys(gridImages)){
      const hasImg = Object.keys(gridImages[uid]||{}).length>0;
      if(hasImg && userDeptByKey.get(uid)!==actorDepartment) crossDeptUids.add(uid);
    }
    if(crossDeptUids.size>0){
      const names=[...crossDeptUids].map(uid=>{
        const u=users.find(x=> getUserKey(x)===uid || String((x as any).Personnel_ID)===uid);
        return u? `${displayName(u)} (${u.Department||'—'})` : uid;
      }).slice(0,5).join(', ');
      setResultPopup({type:'error', title:'บันทึกได้เฉพาะฝ่ายของตนเอง', message:`คุณอยู่ฝ่าย “${actorDepartment}” ไม่สามารถบันทึกให้บุคลากรต่างฝ่ายได้ — พบ ${crossDeptUids.size} คนที่ไม่ใช่ฝ่ายคุณ: ${names}${crossDeptUids.size>5?' …':''}`});
      return;
    }
    // ตรวจ Mode 1: ล็อกตายตัว — เจ้าหน้าที่บันทึกให้ไม่ได้ ต้องให้เจ้าตัวบันทึกเอง
    const mode1Uids = new Set<string>();
    const checkMode1 = (uid:string)=>{
      const u=users.find(x=> getUserKey(x)===uid || String((x as any).Personnel_ID)===uid);
      if(u && !isPendingUser(u) && String(u.Step_Record_Mode||'1')!=='2') mode1Uids.add(uid);
    };
    for(const uid of Object.keys(userFiles)) checkMode1(uid);
    for(const uid of Object.keys(gridInputs)){
      const hasAny = Object.values(gridInputs[uid]||{}).some(v=> parseInt(String(v||''),10)>0);
      if(hasAny) checkMode1(uid);
    }
    for(const uid of Object.keys(gridImages)){
      const hasImg = Object.keys(gridImages[uid]||{}).length>0;
      if(hasImg) checkMode1(uid);
    }
    if(mode1Uids.size>0){
      const names=[...mode1Uids].map(uid=>{
        const u=users.find(x=> getUserKey(x)===uid || String((x as any).Personnel_ID)===uid);
        return u? displayName(u) : uid;
      }).slice(0,5).join(', ');
      setResultPopup({type:'error', title:'ล็อก Mode 1 — บันทึกไม่ได้', message:`พบ ${mode1Uids.size} คนที่อยู่ Mode 1 (บันทึกเอง): ${names}${mode1Uids.size>5?' …':''} — เจ้าหน้าที่ไม่สามารถบันทึกให้ได้ ต้องให้เจ้า�ตัวบันทึกด้วยตนเองที่หน้า “บันทึกนับก้าว”`});
      return;
    }
    const gridReadyCount = Object.entries(gridInputs).reduce((s,[uid,days])=> s + Object.entries(days).filter(([d,v])=> weekDays.includes(d) && parseInt(v,10)>0 && gridImages[uid]?.[d]).length,0);
    const fileReadyCount = totalReady;
    if(fileReadyCount===0 && gridReadyCount===0){
      setResultPopup({type:'error', title:'ไม่มีข้อมูลพร้อมบันทึก', message:'กรุณากรอกจำนวนก้าวในตาราง 7 วันพร้อมแนบภาพ หรือโยนไฟล์แล้วใส่จำนวนก้าว'});
      return;
    }
    for(const [uid, arr] of Object.entries(userFiles)){
      for(const f of arr){
        // server-only mode: อนุญาต manualSteps โดยไม่ต้องมี aiResult
        const stepsNum=parseInt(f.manualSteps||String(f.aiResult?.steps||''),10);
        if(!stepsNum || stepsNum<=0){
          setResultPopup({type:'error', title:'จำนวนก้าวไม่ถูกต้อง', message:`${displayName(users.find(u=>String(u.User_ID)===uid)||null)} วันที่ ${f.targetDate} — กรุณาใส่ก้าวมากกว่า 0`});
          return;
        }
        if(!weekDays.includes(f.targetDate)){
          setResultPopup({type:'error', title:'วันที่เป้าหมายไม่อยู่ในสัปดาห์', message:`วันที่ ${f.targetDate} ไม่อยู่ในสัปดาห์ที่เลือก (${formatWeekRangeThai(weekMonday)})`});
          return;
        }
      }
    }
    // ตรวจ grid inputs
    for(const [uid, days] of Object.entries(gridInputs)){
      for(const [d, v] of Object.entries(days)){
        if(!weekDays.includes(d)) continue;
        if(v && v.trim()!=='' ){
          const stepsNum=parseInt(v,10);
          if(!stepsNum || stepsNum<=0){
            setResultPopup({type:'error', title:'จำนวนก้าวไม่ถูกต้อง', message:`${displayName(users.find(u=> getUserKey(u)===uid)||null)} วันที่ ${d} — กรุณาใส่ก้าวมากกว่า 0 หรือเว้นว่าง`});
            return;
          }
          if(!gridImages[uid]?.[d]){
            setResultPopup({type:'error', title:'ขาดภาพหลักฐาน', message:`${displayName(users.find(u=> getUserKey(u)===uid)||null)} วันที่ ${d} มีจำนวนก้าวแต่ยังไม่ได้แนบภาพหลักฐาน`});
            return;
          }
        }
      }
    }
    setSaving(true);
    try{
      const payloadSteps: any[] = [];
      for(const [uid, arr] of Object.entries(userFiles)){
        for(const f of arr){
          const stepsNum=parseInt(f.manualSteps||String(f.aiResult?.steps||''),10);
          const r=f.aiResult;
          let notes=r?.notes||'';
          if(r?.dateMatch===null || r?.dateMatch===false){
            if(!notes.includes('จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง')){
              notes=(notes?notes+' ':'')+'(หมายเหตุ: จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง)';
            }
          }
          payloadSteps.push({
            User_ID: uid,
            Day: f.targetDate,
            Steps_Count: stepsNum,
            Image_Base64: f.preview,
            AI_Steps: r?.steps ?? '',
            AI_Confidence: r?.confidence ?? '',
            Date_In_Image: r?.dateInImage ?? '',
            Date_Match: r?.dateMatch===true? 'TRUE': r?.dateMatch===false? 'FALSE':'',
            Alert_Flag: r?.alert? 'TRUE':'FALSE',
            Alert_Reason: r?.alertReasons? r.alertReasons.join('; '):'',
            Notes: notes
          });
        }
      }
      // เพิ่มข้อมูลจากตาราง 7 วัน (hybrid)
      for(const [uid, days] of Object.entries(gridInputs)){
        for(const [d, v] of Object.entries(days)){
          if(!weekDays.includes(d)) continue;
          const stepsNum=parseInt(v,10);
          if(!stepsNum || stepsNum<=0) continue;
          const img = gridImages[uid]?.[d];
          if(!img) continue;
          // กันซ้ำกับ userFiles ที่บันทึกซ้ำวันเดียวกัน — ให้ grid ทับถ้าชนกัน (แจ้งเตือนแล้ว)
          const already = payloadSteps.some(p=> p.User_ID===uid && p.Day===d);
          if(already && !allowOverwrite) continue;
          if(already) {
            // ลบตัวเก่าให้เหลือล่าสุด (grid)
            const idx = payloadSteps.findIndex(p=> p.User_ID===uid && p.Day===d);
            if(idx>=0) payloadSteps.splice(idx,1);
          }
          payloadSteps.push({
            User_ID: uid,
            Day: d,
            Steps_Count: stepsNum,
            Image_Base64: img.preview,
            AI_Steps: '',
            AI_Confidence: '',
            Date_In_Image: '',
            Date_Match: '',
            Alert_Flag: 'FALSE',
            Alert_Reason: '',
            Notes: 'บันทึกผ่านตาราง 7 วัน (hybrid) — AI จะตรวจหลังบันทึก'
          });
        }
      }
      // ตรวจว่าจะมีการเขียนทับหรือไม่ — แจ้งเตือนตามสเปค 2.2
      const willOverwrite = payloadSteps.some(p=> existingMap.has(`${p.User_ID}|${p.Day}`));
      if(willOverwrite && !allowOverwrite) {
        setResultPopup({type:'error', title:'มีวันที่ซ้ำ', message:'บางวันมีข้อมูลอนุมัติแล้ว — หากต้องการแทนที่ให้ติ๊ก "อนุญาตแทนที่วันที่บันทึกแล้ว" หรือบันทึกจะข้ามรายการเหล่านั้น'});
        // ยังให้ GAS ตัดสินใจข้ามเอง
      }
      const res = await fetch('/api/steps/batch-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ Logged_By: user.User_ID, Logged_Department: actorDepartment, Week_Start: weekStart, Allow_Overwrite: allowOverwrite? '1':'0', Steps: payloadSteps }) });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || data.error) throw new Error(data.error||'บันทึกไม่สำเร็จ');
      const saved=data.saved ?? payloadSteps.length;
      const skipped=data.skipped ?? 0;
      const errors=data.errors ?? 0;
      let msg=data.message || `บันทึกสำเร็จ ${saved} รายการ`;
      if(saved>0) msg+= `\nAI จะตรวจสอบหลังบันทึก — ถ้าผ่านจะอนุมัติทันที ไม่ผ่านจะขึ้นสถานะรอตรวจสอบต่างฝ่าย (ดูที่เมนูตรวจสอบนับก้าว)`;
      if(skipped>0) msg+=` (ข้าม ${skipped} รายการที่ซ้ำ — จะแสดงเฉพาะจำนวนก้าวล่าสุดที่บันทึก ไม่นับซ้ำรายวัน)`;
      if(errors>0) msg+=` (ผิดพลาด ${errors} รายการ)`;
      if(data.details) msg+= `\n`+ JSON.stringify(data.details).slice(0,500);
      setResultPopup({type:'success', title:'บันทึกสำเร็จ', message: msg});
      setUserFiles({});
      setGridInputs({});
      setGridImages({});
      const s=await fetchData<StepsLog[]>('steps');
      if(s) setStepsData(s);
    }catch(err){
      setResultPopup({type:'error', title:'บันทึกไม่สำเร็จ', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{ setSaving(false); }
  }

  function setGridStep(uid:string, day:string, val:string){
    const targetU = users.find(x=> getUserKey(x)===uid);
    if(targetU && !isPendingUser(targetU) && String(targetU.Step_Record_Mode||'1')!=='2'){
      setResultPopup({type:'error', title:'ล็อก Mode 1', message:`${displayName(targetU)} อยู่ใน Mode 1 (บันทึกเอง) — เจ้าหน้าที่ไม่สามารถบันทึกให้ได้ ต้องให้เจ้าตัวบันทึกด้วยตนเอง`});
      return;
    }
    setGridInputs(prev=> ({...prev, [uid]: {...(prev[uid]||{}), [day]: val}}));
    if(val && existingMap.has(`${uid}|${day}`) && !overwriteWarning){
      setOverwriteWarning(true);
    }
  }
  async function handleGridImage(uid:string, day:string, files: FileList | null){
    if(!files || files.length===0) return;
    const targetU2 = users.find(x=> getUserKey(x)===uid);
    if(targetU2 && !isPendingUser(targetU2) && String(targetU2.Step_Record_Mode||'1')!=='2'){
      setResultPopup({type:'error', title:'ล็อก Mode 1', message:`${displayName(targetU2)} อยู่ใน Mode 1 (บันทึกเอง) — เจ้าหน้าที่ไม่สามารถแนบภาพให้ได้`});
      return;
    }
    const file=files[0];
    if(!file.type.startsWith('image/')) return;
    try{
      const preview=await compressImage(file);
      setGridImages(prev=> ({...prev, [uid]: {...(prev[uid]||{}), [day]: {preview, file}}}));
    }catch(e){
      setResultPopup({type:'error', title:'อ่านรูปไม่สำเร็จ', message: e instanceof Error? e.message:'อ่านไฟล์รูปไม่สำเร็จ'});
    }
  }
  function clearGridImage(uid:string, day:string){
    setGridImages(prev=>{
      const next={...prev};
      if(next[uid]){ const c={...next[uid]}; delete c[day]; next[uid]=c; if(Object.keys(c).length===0) delete next[uid]; }
      return next;
    });
  }

  if(loading) return <div className="flex items-center justify-center py-20"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">บันทึกนับก้าวแบบกลุ่ม (เจ้าหน้าที่ นสส.)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ตาราง: <strong>1 ช่องโยนไฟล์/คน</strong> — โยนได้สูงสุด 7 ภาพ/คน/สัปดาห์ ต่อสัปดาห์ — กด <strong>AI ประมวลผล</strong> พร้อมกัน แล้วแสดงค่าทันที (แก้ไขได้ก่อนบันทึก)</p>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl border">
          ฝ่ายคุณ: <strong className="text-emerald-700 dark:text-emerald-400">{user?.Department || '—'}</strong> {mode2Count>0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-bold">Mode 2: {mode2Count} คน</span>}
        </div>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">สัปดาห์:</span>
            <button onClick={()=>{ const prev=new Date(weekStart); prev.setDate(prev.getDate()-7); setWeekStart(toIsoLocal(prev)); }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200"><span className="material-symbols-outlined text-base">chevron_left</span></button>
            <input type="date" value={weekStart} onChange={e=>{ if(e.target.value){ const m=getMonday(new Date(e.target.value)); setWeekStart(toIsoLocal(m)); }}} className="text-sm font-medium bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700" />
            <button onClick={()=>{ const next=new Date(weekStart); next.setDate(next.getDate()+7); setWeekStart(toIsoLocal(next)); }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200"><span className="material-symbols-outlined text-base">chevron_right</span></button>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full border">{formatWeekRangeThai(weekMonday)}</span>
          </div>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-sm" title="ล็อกตามฝ่ายของคุณ — บันทึกได้เฉพาะฝ่ายตนเองเท่านั้น">
            <span className="material-symbols-outlined text-base text-emerald-600">apartment</span>
            <span className="font-bold text-gray-900 dark:text-white">{actorDepartment || '— ไม่พบฝ่าย —'}</span>
            <span className="text-xs text-gray-500">• บันทึกได้เฉพาะฝ่ายนี้</span>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อในฝ่ายคุณ..." className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm flex-1 min-w-[140px]" />
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={allowOverwrite} onChange={e=>setAllowOverwrite(e.target.checked)} className="checkbox checkbox-xs" />
            อนุญาตแทนที่วันที่บันทึกแล้ว
          </label>
        </div>
        <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-2">
          <span className="material-symbols-outlined text-base mt-0.5">lock</span>
          <span><strong>ข้อจำกัดฝ่าย:</strong> บัญชีนี้บันทึกได้เฉพาะ <strong>ฝ่าย/ส่วนราชการของตนเอง ({actorDepartment || '—'})</strong> เท่านั้น — ระบบล็อกฝ่ายอัตโนมัติและตรวจทั้งหน้าบ้าน/หลังบ้าน หากพยายามบันทึกให้ฝ่ายอื่นจะถูกปฏิเสธ</span>
        </div>
        <div className="mt-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            วิธีใช้: กรอกจำนวนก้าวใน <strong>ตาราง 7 วัน</strong> พร้อมแนบภาพหลักฐานต่อวัน — สามารถบันทึกย้อนหลังได้ หากวันนั้นมีข้อมูล Approved แล้ว ระบบจะข้าม (เว้นแต่ติ๊กอนุญาตแทนที่)
        </div>
      </GlassCard>

      {/* Global progress bar */}
      {aiProcessing && aiProgress && (
        <GlassCard className="p-4 border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="loading loading-spinner loading-sm text-purple-600"></span>
              <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
                กำลังประมวลผล {aiProgress.currentUserName ? `${aiProgress.currentUserName} — ${aiProgress.currentFileName || ''}` : `${aiProgress.done}/${aiProgress.total} ภาพ`}
              </span>
            </div>
            <span className="text-sm font-black text-purple-700 dark:text-purple-300">{aiProgress.percent}%</span>
          </div>
          <div className="w-full bg-white dark:bg-gray-700 rounded-full h-3 overflow-hidden border border-purple-200 dark:border-purple-700">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-1" style={{width: `${aiProgress.percent}%`}}>
              <span className="text-[10px] font-bold text-white">{aiProgress.done}/{aiProgress.total}</span>
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-purple-600 dark:text-purple-400 mt-1">
            <span>เสร็จ {aiProgress.done} ภาพ</span>
            <span>เหลือ {aiProgress.total - aiProgress.done} ภาพ</span>
            <span>ทั้งหมด {aiProgress.total} ภาพ</span>
          </div>
        </GlassCard>
      )}



      {/* ตาราง 7 วัน hybrid: กรอกเลข + แนบภาพต่อวัน (ตามสเปค 2.2) */}
      <GlassCard className="overflow-hidden p-0">
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="material-symbols-outlined text-emerald-600">calendar_view_week</span>ตารางกรอกก้าว 7 วัน (Hybrid)</h3>
            <p className="text-xs text-gray-500 mt-0.5">กรอกจำนวนก้าวแต่ละวันในสัปดาห์ที่เลือก (7 วัน) พร้อมแนบภาพหลักฐานต่อวัน · สามารถบันทึกย้อนหลังได้ · หากบันทึกซ้ำวันเดียวกันจะแสดง “จำนวนก้าวล่าสุด” เท่านั้น ไม่นับซ้ำ</p>
          </div>
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-white dark:bg-gray-800 border">{formatWeekRangeThai(weekMonday)}</span>
        </div>
        {overwriteWarning && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <span className="material-symbols-outlined text-base">warning</span>
            <span>คำเตือน: คุณกำลังแก้ไขวันที่ที่มีข้อมูลอนุมัติแล้ว — เมื่อบันทึก ระบบจะแสดง <strong>จำนวนก้าวล่าสุด</strong> ที่บันทึกเท่านั้น (ไม่บวกซ้ำ) สามารถพิมพ์ทับและแนบภาพใหม่ได้ทันที</span>
            <button onClick={()=> setOverwriteWarning(false)} className="ml-auto text-amber-600 hover:text-amber-800">✕</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <th className="px-3 py-3 font-semibold sticky left-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur z-10 min-w-[180px] text-left">บุคลากร</th>
                {weekDays.map((d,i)=> (
                  <th key={d} className="px-2 py-3 font-semibold text-center min-w-[130px]">
                    <div className="flex flex-col items-center">
                      <span>{weekDaysLabel[i].split(' ').slice(0,2).join(' ')}</span>
                      <span className="text-[10px] font-normal normal-case">{d.slice(5)}</span>
                      {existingMap.size>0 && <span className="text-[9px] font-normal">อนุมัติ: {existingMap.has(`${'placeholder'}|${d}`) ? '—' : ''}</span>}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold text-center min-w-[90px]">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.length===0 ? (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400">ไม่พบข้อมูลบุคลากร</td></tr>
              ) : filteredUsers.map(u=>{
                const uid=getUserKey(u);
                const isMode2=String(u.Step_Record_Mode||'1')==='2';
                const pendingUser=isPendingUser(u);
                // Mode 1 ล็อกตายตัว — ต้องบันทึกด้วยตนเอง เจ้าหน้าที่บันทึกให้ไม่ได้ (ไม่เกี่ยวกับ allowOverwrite)
                // allowOverwrite มีผลเฉพาะ Mode 2 ที่จะเขียนทับ Approved เดิมเท่านั้น
                const locked = !pendingUser && !isMode2;
                const name=displayName(u);
                return (
                  <tr key={uid} className={`${locked? 'bg-gray-50 dark:bg-gray-800/30 opacity-60' : 'hover:bg-gray-50/30'} ${!uid? 'opacity-40':''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-100 dark:border-gray-700 align-top">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">{(u.Full_Name||'ส').charAt(0)}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate max-w-[120px]" title={name}>{name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{u.Department}</p>
                          {locked && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 text-[9px] font-bold mt-1" title="Mode 1 — ต้องบันทึกด้วยตนเอง"><span className="material-symbols-outlined text-xs">lock</span>ล็อก Mode 1 • บันทึกเองเท่านั้น</span>}
                          {!locked && isMode2 && <span className="inline-flex px-1 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold mt-1">Mode 2 • จนท.บันทึกให้</span>}
                          {!locked && pendingUser && <span className="inline-flex px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold mt-1 ml-1">รอลงทะเบียน</span>}
                        </div>
                      </div>
                    </td>
                    {weekDays.map(d=>{
                      const existing = existingMap.get(`${uid}|${d}`);
                      const val = gridInputs[uid]?.[d] ?? (existing ? String(existing.Steps_Count) : '');
                      const hasExisting = !!existing;
                      const img = gridImages[uid]?.[d];
                      const disabled = locked || !uid;
                      return (
                        <td key={d} className={`px-2 py-2 align-top text-center ${hasExisting? 'bg-emerald-50/30 dark:bg-emerald-900/10':''}`}>
                          <input type="number" min={0} placeholder={hasExisting? String(existing.Steps_Count) : '—'} value={gridInputs[uid]?.[d] ?? ''}
                            onChange={e=> setGridStep(uid, d, e.target.value)}
                            disabled={disabled}
                            title={locked? 'Mode 1 — ล็อก: ต้องบันทึกด้วยตนเอง เจ้าหน้าที่บันทึกให้ไม่ได้' : hasExisting? `มีข้อมูลแล้ว ${Number(existing.Steps_Count).toLocaleString()} ก้าว — พิมพ์ทับเพื่อแก้ไข` : '' }
                            className={`w-full px-2 py-1.5 rounded-lg border text-xs font-bold text-center ${disabled? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 cursor-not-allowed' : hasExisting? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'} focus:outline-none focus:ring-1 focus:ring-emerald-500`} />
                          <div className="mt-1 flex flex-col items-center gap-1">
                            {img ? (
                              <div className="relative">
                                <img src={img.preview} alt="" className="w-14 h-10 object-cover rounded border" />
                                <button onClick={()=> clearGridImage(uid,d)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] leading-none">✕</button>
                              </div>
                            ) : (
                              <label className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border cursor-pointer ${disabled? 'opacity-40 pointer-events-none bg-gray-100' : 'bg-white dark:bg-gray-700 hover:bg-emerald-50 border-gray-200 dark:border-gray-600'}`}>
                                <span className="material-symbols-outlined text-xs">image</span> แนบภาพ
                                <input type="file" accept="image/*" className="hidden" onChange={e=> handleGridImage(uid,d,e.target.files)} disabled={disabled} ref={el=>{ if(el) gridFileInputs.current[`${uid}|${d}`]=el; }} />
                              </label>
                            )}
                            {hasExisting && !gridInputs[uid]?.[d] && <span className="text-[9px] text-emerald-600 font-medium">{Number(existing.Steps_Count).toLocaleString()} ก้าว</span>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center align-top">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {weekDays.reduce((s,d)=>{
                          const v=gridInputs[uid]?.[d];
                          const n=v? parseInt(v,10):0;
                          return s + (n>0? n : 0);
                        },0).toLocaleString()}
                      </span>
                      <p className="text-[9px] text-gray-400">ก้าว</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
          <p className="text-xs text-gray-500">พิมพ์ทับเพื่อแก้ไขวันเดิมได้ทันที · ต้องแนบภาพทุกวันที่มีจำนวนก้าว · บันทึกแล้ว AI จะตรวจหลังบันทึก (Server-only)</p>
          <button onClick={()=> setConfirmSave(true)} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm shadow disabled:opacity-40 flex items-center gap-2">
            {saving? <><span className="loading loading-spinner loading-xs"></span> กำลังบันทึก...</> : <><span className="material-symbols-outlined">save</span> บันทึก</>}
          </button>
        </div>
      </GlassCard>

      <ConfirmPopup open={confirmSave} title="ยืนยันบันทึกแบบกลุ่ม" message={`คุณกำลังจะบันทึก ${totalReady} รายการ สัปดาห์ ${formatWeekRangeThai(weekMonday)} — ${allowOverwrite? 'โหมดแทนที่เปิดอยู่ จะเขียนทับวันที่ซ้ำ':'จะข้ามวันที่บันทึกซ้ำ'} แน่ใจหรือไม่?`} variant="primary" loading={saving} onConfirm={handleSave} onClose={()=> setConfirmSave(false)} />
      {resultPopup && <ResultPopup open={!!resultPopup} type={resultPopup.type} title={resultPopup.title} message={resultPopup.message} confirmLabel="ตกลง" onClose={()=> setResultPopup(null)} />}
    </div>
  );
}
