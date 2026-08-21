'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import GlassCard from "@/components/ui/GlassCard";
import ConfirmPopup from "@/components/ui/ConfirmPopup";
import ResultPopup from "@/components/ui/ResultPopup";
import { useAuth } from "@/hooks/useAuth";
import { fetchData } from "@/services/api";
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
function getUserKey(u: User): string { return String((u as any).User_ID || u.Personnel_ID || '').trim(); }
function isPendingUser(u: User): boolean { return !String((u as any).User_ID || '').trim(); }

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
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const weekMonday = useMemo(()=> getMonday(new Date(weekStart)),[weekStart]);
  const weekDays: string[] = useMemo(()=> Array.from({length:7},(_,i)=>{ const d=new Date(weekMonday); d.setDate(d.getDate()+i); return toIsoLocal(d); }),[weekMonday]);
  const weekDaysLabel = useMemo(()=> weekDays.map(d=>{ const dt=new Date(d); const dow=['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'][dt.getDay()===0?6:dt.getDay()-1]; return `${dow} ${formatThaiDateShort(dt)}`; }),[weekDays]);

  useEffect(()=>{ if(user?.Department) setDeptFilter(user.Department); },[user?.Department]);

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
    let list=users;
    if(deptFilter) list=list.filter(u=>u.Department===deptFilter);
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
  },[users, deptFilter, search]);

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
    const targetUser = users.find(u=> String(u.User_ID)===userId);
    const userName = targetUser ? displayName(targetUser) : userId;
    setAiProcessing(true);
    setProcessingUserId(userId);
    setAiProgress({total: pending.length, done: 0, percent: 0, currentUserName: userName});
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
        setAiProgress({total: pending.length, done: idx, percent: Math.round((idx/pending.length)*100), currentUserName: userName, currentFileName: fileItem.file.name});
        // call single image analyze for immediate result
        const res = await fetch('/api/steps/image-analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: fileItem.preview, expectedDate: fileItem.targetDate }) });
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
      const CONCURRENCY = 6; // ประมวลผลพร้อมกัน 6 คน ให้เสร็จใกล้เคียงกัน
      const processOneUser = async (u: User) => {
        const uid=getUserKey(u);
        const pending = (userFiles[uid]||[]).filter(f=> !f.aiResult);
        if(pending.length===0) return;
        const userName=displayName(u);
        const usedInBatch = new Set<string>();
        for(const f of (userFiles[uid]||[])){ if(f.aiResult) usedInBatch.add(f.targetDate); }
        if(!allowOverwrite){ for(const d of weekDays){ if(existingMap.has(`${uid}|${d}`)) usedInBatch.add(d); } }
        for(let idx=0; idx<pending.length; idx++){
          const fileItem = pending[idx];
          setUserFiles(prev=>{ const arr=[...(prev[uid]||[])]; return {...prev, [uid]: arr.map(f=> f.id===fileItem.id? {...f, isProcessing:true}: f)}; });
          updateGlobalProgress(userName, fileItem.file.name);
          const res = await fetch('/api/steps/image-analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: fileItem.preview, expectedDate: fileItem.targetDate }) });
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
        await Promise.all(batch.map(u => processOneUser(u)));
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
    if(totalReady===0){
      setResultPopup({type:'error', title:'ไม่มีข้อมูลพร้อมบันทึก', message:'กรุณาอัปโหลดและให้ AI ประมวลผลก่อน (1 ช่อง/คน, AI จะแสดงค่าทันที)'});
      return;
    }
    for(const [uid, arr] of Object.entries(userFiles)){
      for(const f of arr){
        if(!f.aiResult && !f.manualSteps){
          setResultPopup({type:'error', title:'ข้อมูลไม่ครบ', message:`${displayName(users.find(u=>String(u.User_ID)===uid)||null)} มีไฟล์ที่ยังไม่ได้ประมวลผล — กรุณากด AI ประมวลผล`});
          return;
        }
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
      const res = await fetch('/api/steps/batch-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ Logged_By: user.User_ID, Week_Start: weekStart, Allow_Overwrite: allowOverwrite? '1':'0', Steps: payloadSteps }) });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || data.error) throw new Error(data.error||'บันทึกไม่สำเร็จ');
      const saved=data.saved ?? payloadSteps.length;
      const skipped=data.skipped ?? 0;
      const errors=data.errors ?? 0;
      let msg=data.message || `บันทึกสำเร็จ ${saved} รายการ`;
      if(skipped>0) msg+=` (ข้าม ${skipped} รายการที่ซ้ำ)`;
      if(errors>0) msg+=` (ผิดพลาด ${errors} รายการ)`;
      if(data.details) msg+= `\n`+ JSON.stringify(data.details).slice(0,500);
      setResultPopup({type:'success', title:'บันทึกสำเร็จ', message: msg});
      setUserFiles({});
      const s=await fetchData<StepsLog[]>('steps');
      if(s) setStepsData(s);
    }catch(err){
      setResultPopup({type:'error', title:'บันทึกไม่สำเร็จ', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{ setSaving(false); }
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
          <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
            <option value="">ทุกส่วนราชการ</option>
            {DEPARTMENTS.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อ..." className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm flex-1 min-w-[140px]" />
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={allowOverwrite} onChange={e=>setAllowOverwrite(e.target.checked)} className="checkbox checkbox-xs" />
            อนุญาตแทนที่วันที่บันทึกแล้ว
          </label>
        </div>
        <div className="mt-3 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          วิธีใช้: อัปโหลดรูปหลักฐานลง <strong>ช่องโยนไฟล์ของแต่ละคน (1 ช่อง/คน)</strong> — ลากหรือคลิกเลือกได้ครั้งละหลายไฟล์ (สูงสุด 7 ภาพ/คน/สัปดาห์) — แล้วกด <strong>AI ประมวลผล</strong> (ประมวลพร้อมกัน <strong>ทีละ 6 คน</strong> โดยยืม model อื่นช่วย <code>Gemini → stealth/ox-alpha → gemma-4-26b-a4b-it:free</code> เพื่อให้เสร็จใกล้เคียงกัน) — AI จะอ่านจำนวนก้าว + วันที่ในภาพ แล้วแสดงค่าทันทีในแถวของคนนั้น (แก้ไขก้าว/วันที่เป้าหมายได้) + แสดง badge ว่าใช้ AI ตัวไหน — หากวันที่ไม่ชัด AI จะใส่หมายเหตุ <em>“จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง”</em> — หากวันนั้นมีข้อมูล Approved แล้ว ระบบจะข้าม (เว้นแต่ติ๊กอนุญาตแทนที่)
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

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <th className="px-3 py-3 font-semibold sticky left-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur z-10 min-w-[220px] text-left">บุคลากร (1 แถว = 1 คน)</th>
                <th className="px-3 py-3 font-semibold text-left min-w-[380px]">โยนไฟล์หลักฐาน (1 ช่อง/คน — สูงสุด 7 ภาพ/สัปดาห์)</th>
                <th className="px-3 py-3 font-semibold text-left min-w-[420px]">ผล AI ประมวลผล (แสดงทันทีเมื่อเสร็จแต่ละภาพ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.length===0 ? (
                <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-400">ไม่พบข้อมูลบุคลากร — ลองเปลี่ยนตัวกรองฝ่าย หรือตรวจสอบว่าบุคลากรถูกตั้งเป็น Mode 2</td></tr>
              ) : filteredUsers.map(u=>{
                const uid=getUserKey(u);
                const pendingUser=isPendingUser(u);
                const isMode2=String(u.Step_Record_Mode||'1')==='2';
                const name=displayName(u);
                const files=userFiles[uid]||[];
                const existingWeek=getExistingForUserWeek(uid);
                const pendingInRow = files.filter(f=> !f.aiResult).length;
                const doneInRow = files.filter(f=> f.aiResult).length;
                const isThisRowProcessing = processingUserId===uid && aiProcessing;
                return (
                  <tr key={uid} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${!uid?'opacity-60':''} ${!isMode2 && !pendingUser?'bg-amber-50/20 dark:bg-amber-900/5':''} ${isThisRowProcessing? 'bg-purple-50/30 dark:bg-purple-900/10':''}`}>
                    <td className="px-3 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-100 dark:border-gray-700 align-top">
                      <div className="flex items-center gap-2.5">
                        {u.Profile_Image ? <img src={profileImageUrl(u.Profile_Image)||''} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-emerald-200 shrink-0" /> : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">{(u.Full_Name||u.First_Name||'ส').charAt(0)}</div>}
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 dark:text-white truncate max-w-[150px]" title={name}>{name}</div>
                          <div className="text-[11px] text-gray-400 truncate">{u.Department} • {u.Position||'—'}</div>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border mt-1 ${isMode2? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200':'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200'}`}>{isMode2?'Mode 2: จนท.บันทึกให้':'Mode 1: บันทึกเอง'}</span>
                          {pendingUser && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border mt-1 ml-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200">รอลงทะเบียน</span>}
                          {!uid && <div className="text-[10px] text-red-400">ไม่พบรหัสบุคลากร</div>}
                          {existingWeek.length>0 && <div className="mt-1 flex flex-wrap gap-1">{existingWeek.map(e=> <span key={e.date} className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">{e.date.slice(5)}:{Number(e.log.Steps_Count).toLocaleString()}</span>)}</div>}
                          <div className="text-[10px] text-gray-400 mt-0.5">สัปดาห์นี้: {existingWeek.length}/7 วัน</div>
                          {files.length>0 && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-purple-600 rounded-full transition-all" style={{width: `${files.length? Math.round((doneInRow/files.length)*100):0}%`}}></div>
                              </div>
                              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{doneInRow}/{files.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <label className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all min-h-[110px] ${!uid?'opacity-40 pointer-events-none':''} ${files.length>0?'border-emerald-300 bg-emerald-50/30 dark:bg-emerald-900/10':'border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50/20'} ${isThisRowProcessing? 'ring-2 ring-purple-400':''}`}>
                        <span className="material-symbols-outlined text-2xl text-gray-400">cloud_upload</span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">โยนไฟล์ที่นี่ หรือคลิกเลือก (สูงสุด 7 ภาพ)</span>
                        <span className="text-[11px] text-gray-400">{files.length}/7 ภาพ • {weekDaysLabel.join(' • ').slice(0,80)}...</span>
                        <input type="file" accept="image/*" multiple className="hidden" ref={el=>{ fileInputRefs.current[uid]=el; }} onChange={e=>{ const fl=e.target.files; if(fl && fl.length>0) handleFilesForUser(uid, fl); }} disabled={!uid} />
                      </label>
                      {files.length>0 && (
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {files.map(f=> (
                            <div key={f.id} className={`relative rounded-lg overflow-hidden border-2 bg-white dark:bg-gray-800 ${f.isProcessing? 'border-purple-400 ring-2 ring-purple-200': f.aiResult? 'border-emerald-300':'border-gray-200 dark:border-gray-700'}`}>
                              <img src={f.preview} alt="preview" className="w-full h-20 object-cover" />
                              {f.isProcessing && (
                                <div className="absolute inset-0 bg-purple-600/60 flex flex-col items-center justify-center">
                                  <span className="loading loading-spinner loading-sm text-white"></span>
                                  <span className="text-[9px] font-bold text-white mt-1">AI...</span>
                                </div>
                              )}
                              <button onClick={()=> removeFile(uid, f.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"><span className="material-symbols-outlined text-sm">close</span></button>
                              <div className="px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate bg-gray-50 dark:bg-gray-700/50 text-center">{f.file.name.slice(0,18)}</div>
                              {f.aiResult && !f.isProcessing && <div className="absolute bottom-6 left-1 px-1 py-0.5 rounded bg-purple-600 text-white text-[9px] font-bold">{f.aiResult.steps!=null? f.aiResult.steps.toLocaleString():'—'} ก้าว</div>}
                              {f.aiResult && !f.isProcessing && <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center"><span className="material-symbols-outlined text-xs">check</span></div>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button onClick={()=> handleAiForUser(uid)} disabled={aiProcessing || files.filter(f=>!f.aiResult).length===0 || !uid} className="flex-1 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 font-bold text-xs hover:bg-purple-100 disabled:opacity-40 flex items-center justify-center gap-1">
                          {isThisRowProcessing ? <><span className="loading loading-spinner loading-xs"></span> กำลังประมวล...</> : <><span className="material-symbols-outlined text-sm">auto_awesome</span> AI ประมวลแถวนี้ ({files.filter(f=>!f.aiResult).length})</>}
                        </button>
                        {files.length>0 && <button onClick={()=> { setUserFiles(prev=>{ const n={...prev}; delete n[uid]; return n; }); const r=fileInputRefs.current[uid]; if(r) r.value=''; }} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-gray-50">ล้าง</button>}
                      </div>
                      {isThisRowProcessing && files.length>0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[11px] font-medium text-purple-600 dark:text-purple-400 mb-1">
                            <span>{doneInRow}/{files.length} ภาพ</span>
                            <span>{Math.round((doneInRow/files.length)*100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-300" style={{width: `${Math.round((doneInRow/files.length)*100)}%`}}></div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {files.length===0 ? (
                        <div className="text-xs text-gray-400 text-center py-6 border border-dashed rounded-xl">ยังไม่มีภาพ — โยนไฟล์ที่ช่องกลาง แล้วกด AI ประมวลผล</div>
                      ) : files.every(f=> !f.aiResult && !f.isProcessing) ? (
                        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
                          <span className="material-symbols-outlined text-lg">hourglass_empty</span><br/>รอ AI ประมวลผล — กดปุ่ม <strong>AI ประมวลแถวนี้</strong> หรือปุ่มบน <strong>AI ประมวลผลทั้งหมด</strong>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                          {files.map(f=> (
                            <div key={f.id} className={`p-2.5 rounded-xl border-2 bg-white dark:bg-gray-800 space-y-1.5 ${f.isProcessing? 'border-purple-300 bg-purple-50 dark:bg-purple-900/10': f.aiResult?.alert? 'border-red-200 dark:border-red-800':'border-emerald-200 dark:border-emerald-800'} ${f.isProcessing? 'animate-pulse':''}`}>
                              <div className="flex items-center gap-2">
                                <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {f.isProcessing ? (
                                      <span className="flex items-center gap-1 text-xs font-bold text-purple-600"><span className="loading loading-spinner loading-xs"></span> กำลังอ่าน...</span>
                                    ) : (
                                      <>
                                        <span className="text-xs font-black text-purple-600 dark:text-purple-400">{f.aiResult?.steps!=null? f.aiResult.steps.toLocaleString():'—'} ก้าว</span>
                                        <span className="text-[10px] text-gray-400">มั่นใจ {f.aiResult? Math.round((f.aiResult.confidence||0)*100):'—'}%</span>
                                        {f.aiResult?.provider && <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${f.aiResult.provider==='openrouter'?'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200':'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200'}`} title={f.aiResult.model||''}>{f.aiResult.provider==='openrouter'? `OpenRouter:${(f.aiResult.model||'').split('/').pop()}` : `Gemini:${(f.aiResult.model||'').split('/').pop()||'gemini'}`}</span>}
                                        {f.aiResult && <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center ml-1"><span className="material-symbols-outlined text-xs">check</span></span>}
                                      </>
                                    )}
                                  </div>
                                  <select value={f.targetDate} onChange={e=> updateFile(uid, f.id, {targetDate: e.target.value})} disabled={!!f.isProcessing} className="mt-1 w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 disabled:opacity-50">
                                    {weekDays.map((d,i)=> <option key={d} value={d}>{weekDaysLabel[i]} ({d}) {existingMap.has(`${uid}|${d}`)? '• บันทึกแล้ว':''}</option>)}
                                  </select>
                                </div>
                              </div>
                              {!f.isProcessing && (
                                <>
                                  <input value={f.manualSteps} onChange={e=> updateFile(uid, f.id, {manualSteps: e.target.value})} type="number" placeholder="แก้ไขก้าวได้" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-center" />
                                  <div className="text-[10px] leading-tight">
                                    {f.aiResult?.dateMatch===true ? <span className="text-emerald-600">✓ วันที่ตรง {f.aiResult.dateInImage}</span> : f.aiResult?.dateMatch===false ? <span className="text-red-600">⚠ ไม่ตรง ({f.aiResult.dateInImage||'—'}) → จะบันทึก {f.targetDate}</span> : f.aiResult ? <span className="text-amber-600">? ไม่พบวันที่ → จะบันทึก {f.targetDate}</span> : <span className="text-gray-400">รอผล AI...</span>}
                                  </div>
                                  {f.aiResult?.notes && <div className="text-[10px] text-gray-500 bg-gray-50 dark:bg-gray-700/40 p-1.5 rounded leading-tight">{f.aiResult.notes.slice(0,220)}</div>}
                                  {f.aiResult?.alert && <div className="text-[10px] text-red-600 bg-red-50 dark:bg-red-900/20 p-1 rounded">{f.aiResult.alertReasons.join('; ').slice(0,160)}</div>}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length>0 && (
          <div className="p-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              รวมโยนแล้ว <strong className="text-emerald-600">{totalFiles}</strong> ภาพ • รอ AI <strong className="text-amber-600">{totalPending}</strong> • พร้อมบันทึก <strong className="text-purple-600">{totalReady}</strong> • สูงสุด 7 ภาพ/คน/สัปดาห์
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>{ if(confirm('ล้างภาพทั้งหมด?')) setUserFiles({}); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-white">ล้างทั้งหมด</button>
              <button onClick={handleAiAll} disabled={aiProcessing || totalPending===0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-lg hover:shadow-xl disabled:opacity-40 flex items-center gap-2">
                {aiProcessing ? <><span className="loading loading-spinner loading-xs"></span> กำลังประมวลผล... {aiProgress? `${aiProgress.done}/${aiProgress.total} (${aiProgress.percent}%)`: ''}</> : <><span className="material-symbols-outlined text-lg">auto_awesome</span> AI ประมวลผลทั้งหมด ({totalPending} ภาพ)</>}
              </button>
              <button onClick={()=> setConfirmSave(true)} disabled={saving || totalReady===0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm shadow-lg hover:shadow-xl disabled:opacity-40 flex items-center gap-2">
                {saving ? <><span className="loading loading-spinner loading-xs"></span> กำลังบันทึก...</> : <><span className="material-symbols-outlined">save</span> บันทึกทั้งหมด ({totalReady})</>}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      <ConfirmPopup open={confirmSave} title="ยืนยันบันทึกแบบกลุ่ม" message={`คุณกำลังจะบันทึก ${totalReady} รายการ สัปดาห์ ${formatWeekRangeThai(weekMonday)} — ${allowOverwrite? 'โหมดแทนที่เปิดอยู่ จะเขียนทับวันที่ซ้ำ':'จะข้ามวันที่บันทึกซ้ำ'} แน่ใจหรือไม่?`} variant="primary" loading={saving} onConfirm={handleSave} onClose={()=> setConfirmSave(false)} />
      {resultPopup && <ResultPopup open={!!resultPopup} type={resultPopup.type} title={resultPopup.title} message={resultPopup.message} confirmLabel="ตกลง" onClose={()=> setResultPopup(null)} />}
    </div>
  );
}
