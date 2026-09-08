'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import GlassCard from "@/components/ui/GlassCard";
import ConfirmPopup from "@/components/ui/ConfirmPopup";
import ResultPopup from "@/components/ui/ResultPopup";
import { useAuth } from "@/hooks/useAuth";
import { fetchData, postDataJson } from "@/services/api";
import Modal from "@/components/ui/Modal";
import ProofImage from "@/components/ProofImage";
import AiBatchSummaryPopup, { BatchAiItem } from "@/components/ui/AiBatchSummaryPopup";
import type { User, StepsLog } from "@/types";
import { displayName, profileImageUrl } from "@/utils/personnel";
import { useProjectWindow } from "@/hooks/useProjectWindow";

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
function compressImage(file: File, maxDim=1024, quality=0.72): Promise<string> {
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
  // aiResult ถูกล้างออก
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
  const [savingProgress, setSavingProgress] = useState<{ total: number; done: number; percent: number; model: string } | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [resultPopup, setResultPopup] = useState<{type:'success'|'error', title:string, message:string}|null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [overwriteWarning, setOverwriteWarning] = useState(false);
  const [zoomPreview, setZoomPreview] = useState<{ src: string; name: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [clearTarget, setClearTarget] = useState<{ uid: string; day: string; recordId: string } | null>(null);
  const [clearReason, setClearReason] = useState('');
  const [clearing, setClearing] = useState(false);
  // ตาราง 7 วัน: กรอกเลข + แนบภาพต่อวัน (hybrid)
  const [gridInputs, setGridInputs] = useState<Record<string, Record<string, string>>>({});
  const [gridImages, setGridImages] = useState<Record<string, Record<string, { preview:string, file: File }>>>({});
  const gridFileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const { window: projectWindow, isInWindow } = useProjectWindow();
  // AI batch popup
  const [showBatchAiPopup, setShowBatchAiPopup] = useState(false);
  const [batchAiItems, setBatchAiItems] = useState<BatchAiItem[]>([]);
  const [batchAiAnalyzing, setBatchAiAnalyzing] = useState(false);

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
  const pendingMap = useMemo(()=>{
    const latest=new Map<string, StepsLog>();
    for(const log of stepsData){
      const key=`${String(log.User_ID)}|${normalizeDateKey(log.Date_Thai)}`;
      const cur=latest.get(key);
      if(!cur || String(log.Recorded_At||'') >= String(cur.Recorded_At||'')) latest.set(key, log);
    }
    const pending=new Map<string, StepsLog>();
    for(const [k,v] of latest){ if(String(v.Status)==='Pending') pending.set(k,v); }
    return pending;
  },[stepsData]);
  const deletedMap = useMemo(()=>{
    const latest=new Map<string, StepsLog>();
    for(const log of stepsData){
      const key=`${String(log.User_ID)}|${normalizeDateKey(log.Date_Thai)}`;
      const cur=latest.get(key);
      if(!cur || String(log.Recorded_At||'') >= String(cur.Recorded_At||'')) latest.set(key, log);
    }
    const deleted=new Map<string, StepsLog>();
    for(const [k,v] of latest){ if(String(v.Status)==='Deleted') deleted.set(k,v); }
    return deleted;
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
        newItems.push({ id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2,6)}`, file:f, preview, manualSteps:'', targetDate: defaultDate } as any);
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



  const totalFiles = useMemo(()=> Object.values(userFiles).reduce((s,a)=>s+a.length,0),[userFiles]);
  const totalPending = useMemo(()=> 0,[userFiles]);
  const totalReady = useMemo(()=> Object.values(userFiles).reduce((s,a)=>s+a.filter(f=> f.manualSteps && parseInt(f.manualSteps,10)>0).length,0),[userFiles]);

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
    // ตรวจ Mode 1: ล็อกตายตัวทุกกรณี (รวม pending) — เจ้าหน้าที่บันทึกให้ไม่ได้ ต้องให้เจ้าตัวบันทึกเอง
    const mode1Uids = new Set<string>();
    const checkMode1 = (uid:string)=>{
      const u=users.find(x=> getUserKey(x)===uid || String((x as any).Personnel_ID)===uid);
      if(u && String(u.Step_Record_Mode||'1')!=='2') mode1Uids.add(uid);
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
    // ห้วงเวลาบันทึก: ตรวจว่าทุกวันที่จะบันทึกอยู่ในห้วงโครงการ
    if (projectWindow) {
      const outOfWindow: string[] = [];
      for (const [uid, arr] of Object.entries(userFiles)) {
        for (const f of arr) { if (!isInWindow(f.targetDate)) outOfWindow.push(`${displayName(users.find(x=> getUserKey(x)===uid)||null)} ${f.targetDate}`); }
      }
      for (const [uid, days] of Object.entries(gridInputs)) {
        for (const [d, v] of Object.entries(days)) {
          if (weekDays.includes(d) && parseInt(v as string,10)>0 && gridImages[uid]?.[d] && !isInWindow(d)) outOfWindow.push(`${displayName(users.find(x=> getUserKey(x)===uid)||null)} ${d}`);
        }
      }
      if (outOfWindow.length>0) {
        setResultPopup({type:'error', title:'นอกห้วงเวลาบันทึก', message:`ห้วงที่อนุญาต ${projectWindow.start} ถึง ${projectWindow.end} — พบ ${outOfWindow.length} รายการนอกห้วง: ${outOfWindow.slice(0,3).join(', ')}${outOfWindow.length>3?' …':''} — ไม่สามารถบันทึกได้`});
        return;
      }
    }
    const gridReadyCount = Object.entries(gridInputs).reduce((s,[uid,days])=> s + Object.entries(days).filter(([d,v])=> weekDays.includes(d) && parseInt(v,10)>0 && gridImages[uid]?.[d]).length,0);
    const fileReadyCount = totalReady;
    if(fileReadyCount===0 && gridReadyCount===0){
      setResultPopup({type:'error', title:'ไม่มีข้อมูลพร้อมบันทึก', message:'กรุณากรอกจำนวนก้าวในตาราง 7 วันพร้อมแนบภาพ หรือโยนไฟล์แล้วใส่จำนวนก้าว'});
      return;
    }
    for(const [uid, arr] of Object.entries(userFiles)){
      for(const f of arr){
        // manual mode
        const stepsNum=parseInt(f.manualSteps||'',10);
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
     // เตรียม payloadSteps แบบไม่มี AI ก่อน เพื่อเรียก Typhoon ต่อรายการแล้วโชว์ popup รวม
    const payloadCandidates: any[] = [];
    for(const [uid, arr] of Object.entries(userFiles)){
      for(const f of arr){
        const stepsNum=parseInt(f.manualSteps||'',10);
        payloadCandidates.push({ _uid: uid, _day: f.targetDate, _preview: f.preview, _steps: stepsNum, _display: displayName(users.find(u=> getUserKey(u)===uid)||null) || uid });
      }
    }
    for(const [uid, days] of Object.entries(gridInputs)){
      for(const [d, v] of Object.entries(days)){
        if(!weekDays.includes(d)) continue;
        const stepsNum=parseInt(v,10);
        if(!stepsNum || stepsNum<=0) continue;
        const img = gridImages[uid]?.[d];
        if(!img) continue;
        const already = payloadCandidates.some(p=> p._uid===uid && p._day===d);
        if(already && !allowOverwrite) continue;
        if(already) {
          const idx = payloadCandidates.findIndex(p=> p._uid===uid && p._day===d);
          if(idx>=0) payloadCandidates.splice(idx,1);
        }
        payloadCandidates.push({ _uid: uid, _day: d, _preview: img.preview, _steps: stepsNum, _display: displayName(users.find(u=> getUserKey(u)===uid)||null) || uid });
      }
    }
    if(payloadCandidates.length===0){
      setResultPopup({type:'error', title:'ไม่มีข้อมูลพร้อมบันทึก', message:'กรุณากรอกจำนวนก้าวในตาราง 7 วันพร้อมแนบภาพ หรือโยนไฟล์แล้วใส่จำนวนก้าว'});
      return;
    }
    // เรียก AI ต่อรายการ (batch 3 concurrent) แล้วรวมสรุป popup
    setBatchAiAnalyzing(true);
    setShowBatchAiPopup(true);
    setBatchAiItems([]);
    const analyzed: BatchAiItem[] = [];
    // concurrency 3
    const queue = [...payloadCandidates];
    let idxRun = 0;
    const runOne = async (item: any) => {
      try {
        const res = await fetch('/api/ai/analyze-steps', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: item._preview, expectedDate: item._day, inputSteps: item._steps }) });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data.error||'AI fail');
        analyzed.push({
          uid: item._uid, displayName: item._display, day: item._day, inputSteps: item._steps, preview: item._preview,
          aiSteps: data.aiSteps ?? null, aiStepsRaw: data.aiStepsRaw ?? null, dateRaw: data.dateRaw ?? null, dateNormalized: data.dateNormalized ?? null,
          dateMatch: data.dateMatch ?? null, confidence: data.confidence ?? null, stepsExact: data.stepsExact ?? null,
          alert: !!data.alert, alertReason: data.alertReason || '', expectedDate: item._day, rawText: data.rawText,
        });
      } catch (e) {
        analyzed.push({
          uid: item._uid, displayName: item._display, day: item._day, inputSteps: item._steps, preview: item._preview,
          aiSteps: null, aiStepsRaw: null, dateRaw: null, dateNormalized: null, dateMatch: null, confidence: null, stepsExact: null,
          alert: true, alertReason: e instanceof Error ? e.message : 'AI อ่านไม่สำเร็จ — รอตรวจสอบ', expectedDate: item._day,
        });
      }
      idxRun++; setBatchAiItems([...analyzed]);
    };
    // process in batches of 3
    for (let i=0; i<queue.length; i+=3) {
      await Promise.all(queue.slice(i,i+3).map(runOne));
    }
    setBatchAiAnalyzing(false);
    // รอให้ผู้ใช้ยืนยันใน popup — ถ้าไม่ยืนยันจะไม่อัพโหลด
    // เก็บ analyzed ไว้เพื่อส่งต่อไปเมื่อยืนยัน
    (globalThis as any).__batchAnalyzed = analyzed;
    (globalThis as any).__payloadCandidates = payloadCandidates;
    return;
  }

  async function handleBatchConfirm(){
    const analyzed: BatchAiItem[] = (globalThis as any).__batchAnalyzed || [];
    const payloadCandidates: any[] = (globalThis as any).__payloadCandidates || [];
    if(payloadCandidates.length===0) return;
    setShowBatchAiPopup(false);
    const mapAi = new Map<string, BatchAiItem>();
    for(const a of analyzed) mapAi.set(`${a.uid}|${a.day}`, a);
    const totalToSave = payloadCandidates.length;
    setSaving(true);
    setSavingProgress({ total: totalToSave, done: 0, percent: 0, model: 'กำลังอัปโหลด' });
    let simPercent = 0;
    const simTimer = setInterval(()=>{
      simPercent = Math.min(90, simPercent + Math.random()*6 + 2);
      setSavingProgress(prev=> prev ? { ...prev, percent: Math.round(simPercent), done: Math.round((simPercent/100)*prev.total) } : prev);
    }, 450);
    try{
      const payloadSteps: any[] = [];
      for(const c of payloadCandidates){
        const ai = mapAi.get(`${c._uid}|${c._day}`);
        payloadSteps.push({
          User_ID: c._uid,
          Day: c._day,
          Steps_Count: c._steps,
          Image_Base64: c._preview,
          AI_Steps: ai?.aiSteps != null ? String(ai.aiSteps) : (ai?.aiStepsRaw || ''),
          AI_Confidence: ai?.confidence != null ? String(ai.confidence) : '',
          Date_In_Image: ai?.dateRaw || ai?.dateNormalized || '',
          Date_Match: ai?.dateMatch === true ? 'TRUE' : ai?.dateMatch === false ? 'FALSE' : '',
          Date_Normalized: ai?.dateNormalized || '',
          Alert_Flag: ai?.alert ? 'TRUE' : 'FALSE',
          Alert_Reason: ai?.alertReason || '',
          Notes: ai?.aiStepsRaw ? `AIอ่าน: ${ai.aiStepsRaw} | วันที่ดิบ: ${ai.dateRaw || '—'}` : ''
        });
      }
      // ตรวจว่าจะมีการเขียนทับหรือไม่ — แจ้งเตือนตามสเปค 2.2
      const willOverwrite = payloadSteps.some(p=> existingMap.has(`${p.User_ID}|${p.Day}`));
      if(willOverwrite && !allowOverwrite) {
        setResultPopup({type:'error', title:'มีวันที่ซ้ำ', message:'บางวันมีข้อมูลอนุมัติแล้ว — หากต้องการแทนที่ให้ติ๊ก "อนุญาตแทนที่วันที่บันทึกแล้ว" หรือบันทึกจะข้ามรายการเหล่านั้น'});
        // ยังให้ GAS ตัดสินใจข้ามเอง
      }
      const res = await fetch('/api/steps/batch-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ Logged_By: user!.User_ID, Logged_Department: actorDepartment, Week_Start: weekStart, Allow_Overwrite: allowOverwrite? '1':'0', Steps: payloadSteps }) });
      const data = await res.json().catch(()=>({}));
      clearInterval(simTimer);
      if(data?.aiApproved !== undefined || data?.aiPending !== undefined){
        setSavingProgress({ total: payloadSteps.length, done: payloadSteps.length, percent: 100, model: `เสร็จสิ้น — อนุมัติ ${data.aiApproved??0} · รอต่างฝ่ายตรวจ ${data.aiPending??0}` });
      } else {
        setSavingProgress({ total: payloadSteps.length, done: payloadSteps.length, percent: 100, model: 'เสร็จสิ้น — กำลังสรุปผล' });
      }
      if(!res.ok || data.error) throw new Error(data.error||'บันทึกไม่สำเร็จ');
      const saved=data.saved ?? payloadSteps.length;
      const skipped=data.skipped ?? 0;
      const errors=data.errors ?? 0;
      let msg=data.message || `บันทึกสำเร็จ ${saved} รายการ`;
      if(data.aiApproved !== undefined) msg+= `\n✓ AI อนุมัติทันที ${data.aiApproved} รายการ (มั่นใจสูง ตัวเลข+วันที่ชัดเจนตรงกัน — นับคะแนนแล้ว)`;
      if(data.aiPending !== undefined && data.aiPending>0) msg+= `\n⚠ ส่งต่อให้ต่างฝ่ายตรวจ ${data.aiPending} รายการ (สงสัย/ผิดปกติ/ตัดต่อ) — ดูที่เมนูตรวจสอบนับก้าว`;
      // สรุปรายบุคคล: ชื่อ-สกุล + วันที่แบบย่อ (31 ส.ค. , 1 ก.ย. ... 2569)
      const byUserSave = new Map<string, string[]>();
      for (const p of payloadSteps) { const uid=String(p.User_ID); if(!byUserSave.has(uid)) byUserSave.set(uid, []); byUserSave.get(uid)!.push(String(p.Day)); }
      if (byUserSave.size>0) {
        msg+= `\n\nจำนวน ${byUserSave.size} ราย ดังนี้`;
        for (const [uid, days] of byUserSave) {
          const u = users.find(x=> getUserKey(x)===uid);
          const name = u ? displayName(u) : uid;
          const sorted = days.slice().sort();
          const fmtDays = sorted.map(d=> { const dt=new Date(d); const day=dt.getDate(); const mon=thaiShortMonths[dt.getMonth()]; return `${day} ${mon}`; }).join(' , ');
          const yearBE = toThaiYear(new Date(sorted[0]));
          msg+= `\n${name} วันที่ ${fmtDays} ${yearBE}`;
        }
      }
      if(skipped>0) msg+=` (ข้าม ${skipped} รายการที่ซ้ำ — จะแสดงเฉพาะจำนวนก้าวล่าสุดที่บันทึก ไม่นับซ้ำรายวัน)`;
      if(errors>0) msg+=` (ผิดพลาด ${errors} รายการ)`;
      if(data.details) msg+= `\n`+ JSON.stringify(data.details).slice(0,500);
      // ดีเลย์ให้เห็น 100% แป๊บนึงก่อนปิด popup
      await new Promise(r=> setTimeout(r, 900));
      setSavingProgress(null);
      setResultPopup({type:'success', title:'บันทึกสำเร็จ', message: msg});
      setUserFiles({});
      setGridInputs({});
      setGridImages({});
      const s=await fetchData<StepsLog[]>('steps');
      if(s) setStepsData(s);
    }catch(err){
      clearInterval(simTimer);
      setSavingProgress(null);
      setResultPopup({type:'error', title:'บันทึกไม่สำเร็จ', message: err instanceof Error? err.message:'เกิดข้อผิดพลาด'});
    }finally{ setSaving(false); if(typeof simTimer!=='undefined') clearInterval(simTimer as any); setTimeout(()=> setSavingProgress(null), 1200); }
  }

  function setGridStep(uid:string, day:string, val:string){
    const targetU = users.find(x=> getUserKey(x)===uid);
    if(targetU && String(targetU.Step_Record_Mode||'1')!=='2'){
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
    if(targetU2 && String(targetU2.Step_Record_Mode||'1')!=='2'){
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
  async function handleClearPersisted() {
    if (!clearTarget || !user) return;
    // บล็อกการล้างหากเป้าหมายเป็น Mode 1 — ต้องให้เจ้าตัวจัดการเอง
    const targetUser = users.find(u => getUserKey(u) === clearTarget.uid || String((u as any).Personnel_ID) === clearTarget.uid);
    if (targetUser && String((targetUser as any).Step_Record_Mode || '1') !== '2') {
      setResultPopup({type:'error', title:'ล้างไม่ได้ — Mode 1 ล็อก', message:`${displayName(targetUser)} อยู่ใน Mode 1 (บันทึกเอง) — ไม่สามารถล้างข้อมูลโดยเจ้าหน้าที่ได้ ต้องให้เจ้าตัวจัดการเอง`});
      return;
    }
    if (!clearReason.trim()) { setResultPopup({type:'error', title:'ต้องระบุเหตุผล', message:'กรุณาระบุเหตุผลที่ล้างข้อมูล'}); return; }
    setClearing(true);
    try {
      const res:any = await postDataJson('delete-step', { Record_ID: clearTarget.recordId, Logged_By: String((user as any).User_ID || ''), Delete_Reason: clearReason.trim() });
      if (res?.success) {
        setClearTarget(null); setClearReason('');
        // ล้าง local state ของวันนั้นด้วย
        clearGridImage(clearTarget.uid, clearTarget.day);
        setGridInputs(prev=> { const n={...prev}; if(n[clearTarget.uid]) { const c={...n[clearTarget.uid]}; delete c[clearTarget.day]; n[clearTarget.uid]=c; if(Object.keys(c).length===0) delete n[clearTarget.uid]; } return n; });
        await load();
        setResultPopup({type:'success', title:'ล้างข้อมูลสำเร็จ', message:`ล้างข้อมูล ${clearTarget.day} เรียบร้อย — เหตุผล: ${clearReason}`});
      } else {
        setResultPopup({type:'error', title:'ล้างไม่สำเร็จ', message: res?.message || 'เกิดข้อผิดพลาด'});
      }
    } catch(e:any){ setResultPopup({type:'error', title:'ล้างไม่สำเร็จ', message: e?.message || 'เกิดข้อผิดพลาด'}); }
    setClearing(false);
  }

  if(loading) return <div className="flex items-center justify-center py-20"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">บันทึกนับก้าวแบบกลุ่ม (เจ้าหน้าที่ นสส.)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ตาราง: <strong>1 ช่องโยนไฟล์/คน</strong> — โยนได้สูงสุด 7 ภาพ/คน/สัปดาห์ — กรอกจำนวนก้าวและแนบภาพ แล้วบันทึก</p>
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
          <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">เนื่องจากใช้ Model AI รูปแบบฟรี จึงอาจทำให้ประมวลผลใช้เวลาสักหน่อย รออีกอึดใจเดียว ฮึบ ๆ ✊</p>
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
        <div className="overflow-auto max-h-[68vh] relative border-t border-gray-100 dark:border-gray-700 rounded-b-xl">
          <table className="w-full text-sm min-w-[1380px] border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <th className="px-3 py-3 font-semibold sticky left-0 top-0 z-30 bg-gray-50 dark:bg-gray-800 backdrop-blur min-w-[260px] max-w-[280px] text-left border-r border-b border-gray-200 dark:border-gray-700 shadow-sm">บุคลากร <span className="normal-case text-[10px] font-normal text-gray-400 block">ชื่อจริง • ตำแหน่ง • ชื่อเล่น</span></th>
                {weekDays.map((d)=> {
                  const dt=new Date(d);
                  const dow=['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'][dt.getDay()===0?6:dt.getDay()-1];
                  const shortDate=`${dt.getDate()} ${thaiShortMonths[dt.getMonth()]}`;
                  return (
                  <th key={d} className="px-2 py-3 font-semibold text-center min-w-[150px] sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col items-center leading-tight">
                      <span className="whitespace-nowrap">{dow}</span>
                      <span className="text-[11px] font-bold normal-case text-emerald-700 dark:text-emerald-300">{shortDate}</span>
                    </div>
                  </th>
                  );
                })}
                <th className="px-3 py-3 font-semibold text-center min-w-[90px] sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.length===0 ? (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400">ไม่พบข้อมูลบุคลากร</td></tr>
              ) : filteredUsers.map(u=>{
                const uid=getUserKey(u);
                const isMode2=String(u.Step_Record_Mode||'1')==='2';
                const pendingUser=isPendingUser(u);
                // Mode 1 ล็อกตายตัวทุกกรณี (รวม “รอลงทะเบียน” ด้วย) — ต้องบันทึกด้วยตนเอง เจ้าหน้าที่บันทึกให้ไม่ได้
                // allowOverwrite มีผลเฉพาะ Mode 2 ที่จะเขียนทับ Approved เดิมเท่านั้น
                const locked = !isMode2;
                const name=displayName(u);
                return (
                  <tr key={uid} className={`${locked? 'bg-gray-50 dark:bg-gray-800/30 opacity-60' : 'hover:bg-gray-50/30'} ${!uid? 'opacity-40':''}`}>
                    <td className="px-3 py-3 sticky left-0 bg-white dark:bg-gray-900 z-10 border-r border-gray-100 dark:border-gray-700 align-top shadow-[2px_0_6px_rgba(0,0,0,0.04)]">
                      <div className="flex gap-3 items-start">
                        {u.Profile_Image && profileImageUrl(u.Profile_Image) ? (
                          <img src={profileImageUrl(u.Profile_Image)!} alt="" className="w-12 h-12 rounded-xl object-cover ring-1 ring-emerald-200 shrink-0 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">{(u.Full_Name||u.First_Name||'ส').charAt(0)}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[13px] leading-tight text-gray-900 dark:text-white whitespace-normal break-words" title={name}>{name}</p>
                          {u.Position ? <p className="text-xs leading-tight text-gray-600 dark:text-gray-300 whitespace-normal break-words mt-0.5" title={u.Position}>{u.Position}</p> : <p className="text-xs text-gray-400">— ไม่ระบุตำแหน่ง —</p>}
                          {u.Nickname ? <p className="text-xs leading-tight mt-0.5 whitespace-normal break-words"><span className="text-gray-400">ชื่อเล่น:</span> <span className="font-semibold text-emerald-700 dark:text-emerald-300">{u.Nickname}</span></p> : null}
                          <p className="text-[11px] text-gray-400 whitespace-normal break-words mt-0.5" title={u.Department}>{u.Department}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {locked && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 text-[10px] font-bold" title="Mode 1 — ต้องบันทึกด้วยตนเอง"><span className="material-symbols-outlined text-xs">lock</span>ล็อก Mode 1</span>}
                            {!locked && isMode2 && <span className="inline-flex px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">Mode 2 • จนท.บันทึกให้</span>}
                            {pendingUser && <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">รอลงทะเบียน</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {weekDays.map(d=>{
                      const existing = existingMap.get(`${uid}|${d}`);
                      const pending = pendingMap.get(`${uid}|${d}`);
                      const deleted = deletedMap.get(`${uid}|${d}`);
                      const hasExisting = !!existing;
                      const hasPending = !!pending;
                      const hasDeleted = !!deleted;
                      const persisted = (existing || pending || deleted) as any;
                      const persistedImageId = persisted?.Image_Drive_ID ? String(persisted.Image_Drive_ID) : '';
                      const img = gridImages[uid]?.[d];
                      const disabled = locked || !uid;
                      const bgClass = hasPending ? 'bg-amber-50 dark:bg-amber-900/20' : hasExisting ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : '';
                      const placeholderVal = hasPending ? String(pending.Steps_Count) : hasExisting ? String(existing.Steps_Count) : '—';
                      const titleText = locked ? 'Mode 1 — ล็อก: ต้องบันทึกด้วยตนเอง เจ้าหน้าที่บันทึกให้ไม่ได้' : hasPending ? `รอตรวจสอบ ${Number(pending.Steps_Count).toLocaleString()} ก้าว — รอต่างฝ่ายตรวจ` : hasExisting ? `อนุมัติแล้ว ${Number(existing.Steps_Count).toLocaleString()} ก้าว — พิมพ์ทับเพื่อแก้ไข` : '';
                      return (
                        <td key={d} className={`px-2 py-3 align-top text-center ${bgClass}`}>
                          <input type="number" min={0} placeholder={placeholderVal} value={gridInputs[uid]?.[d] ?? ''}
                            onChange={e=> setGridStep(uid, d, e.target.value)}
                            disabled={disabled}
                            title={titleText}
                            className={`w-full px-2 py-2 rounded-lg border text-sm font-bold text-center ${disabled? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 cursor-not-allowed' : hasPending ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-400 text-amber-800' : hasExisting? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'} focus:outline-none focus:ring-1 focus:ring-emerald-500`} />
                          <div className="mt-2 flex flex-col items-center gap-1.5">
                            {img ? (
                              <div className="relative group">
                                <img src={img.preview} alt="" onClick={()=> setZoomPreview({ src: img.preview, name: `${displayName(users.find(x=> getUserKey(x)===uid) || null)} — ${d}` })} className="w-28 h-20 object-cover rounded-lg border-2 border-emerald-200 dark:border-emerald-800 shadow-sm cursor-zoom-in hover:opacity-80 transition group-hover:ring-2 group-hover:ring-emerald-400" title="คลิกเพื่อดูรูปเต็มก่อนบันทึก" />
                                <button onClick={()=> clearGridImage(uid,d)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs leading-none shadow-md hover:bg-red-600">✕</button>
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] whitespace-nowrap">คลิกดูเต็ม</span>
                              </div>
                            ) : persistedImageId ? (
                              <div className="relative group w-28 h-20 rounded-lg overflow-hidden border-2 border-emerald-200 dark:border-emerald-700 shadow-sm">
                                <ProofImage fileId={persistedImageId} alt={`${displayName(users.find(x=> getUserKey(x)===uid) || null)} — ${d}`} onClick={(src)=> setZoomPreview({ src, name: `${displayName(users.find(x=> getUserKey(x)===uid) || null)} — ${d} (บันทึกแล้ว)` })} />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] whitespace-nowrap">บันทึกแล้ว</span>
                              </div>
                            ) : (
                              <label className={`inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium border cursor-pointer shadow-sm ${disabled? 'opacity-40 pointer-events-none bg-gray-100' : 'bg-white dark:bg-gray-700 hover:bg-emerald-50 border-gray-200 dark:border-gray-600 hover:border-emerald-300'}`}>
                                <span className="material-symbols-outlined text-sm">image</span> แนบภาพ
                                <input type="file" accept="image/*" className="hidden" onChange={e=> handleGridImage(uid,d,e.target.files)} disabled={disabled} ref={el=>{ if(el) gridFileInputs.current[`${uid}|${d}`]=el; }} />
                              </label>
                            )}
                            {hasDeleted && <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">ถูกลบ: {deleted.Reject_Reason || 'ไม่ระบุเหตุผล'}<span className="text-[9px]">· ไม่แสดงผู้ลบ</span></span>}
                            {hasPending && !gridInputs[uid]?.[d] && !hasDeleted && <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">hourglass_top</span>{Number(pending.Steps_Count).toLocaleString()} รอตรวจ</span>}
                            {!hasPending && hasExisting && !gridInputs[uid]?.[d] && !hasDeleted && <span className="text-[10px] text-emerald-600 font-medium">{Number(existing.Steps_Count).toLocaleString()} ก้าว ✓</span>}
                            {(hasExisting || hasPending || hasDeleted) && !img && !locked && (
                              <button onClick={() => { const rec: any = existing || pending || deleted; if(rec) { setClearTarget({uid, day:d, recordId: String(rec.Record_ID)}); setClearReason(''); } }} className="text-[10px] text-gray-400 hover:text-red-500 underline underline-offset-2">ล้างข้อมูล</button>
                            )}
                            {(hasExisting || hasPending || hasDeleted) && !img && locked && (
                              <span className="text-[10px] text-gray-300 cursor-not-allowed" title="Mode 1 — ล็อก ไม่สามารถล้างข้อมูลได้ ต้องให้เจ้าตัวจัดการเอง">ล้างไม่ได้ (Mode 1)</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center align-top">
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
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

      <ConfirmPopup open={confirmSave} title="ยืนยันบันทึกแบบกลุ่ม — จะให้ AI ตรวจก่อน" message={`คุณกำลังจะบันทึก ${totalReady} รายการ สัปดาห์ ${formatWeekRangeThai(weekMonday)} — ระบบจะให้ AI อ่านภาพทุกใบก่อน แล้วโชว์สรุปให้ยืนยันอีกครั้ง ${allowOverwrite? '(โหมดแทนที่เปิดอยู่ จะเขียนทับวันที่ซ้ำ)':'(จะข้ามวันที่บันทึกซ้ำ)'} แน่ใจหรือไม่?`} variant="primary" loading={saving} onConfirm={handleSave} onClose={()=> setConfirmSave(false)} />
      <AiBatchSummaryPopup open={showBatchAiPopup} items={batchAiItems} weekLabel={formatWeekRangeThai(weekMonday)} loading={batchAiAnalyzing} onClose={()=> setShowBatchAiPopup(false)} onConfirm={handleBatchConfirm} />
      {resultPopup && <ResultPopup open={!!resultPopup} type={resultPopup.type} title={resultPopup.title} message={resultPopup.message} confirmLabel="ตกลง" onClose={()=> setResultPopup(null)} />}

      {/* Popup กำลังบันทึก + ตรวจสอบด้วย AI — แสดงชื่อโมเดลและความคืบหน้า */}
      {saving && savingProgress && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="loading loading-spinner loading-md text-emerald-600"></span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">กำลังบันทึกและตรวจสอบด้วย AI</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">โมเดล: <span className="font-bold text-purple-600 dark:text-purple-400">{savingProgress.model}</span></p>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden border border-gray-200 dark:border-gray-600">
              <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-purple-600 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2" style={{width: `${savingProgress.percent}%`}}>
                <span className="text-[11px] font-bold text-white">{savingProgress.percent}%</span>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              <span>บันทึก {savingProgress.done}/{savingProgress.total} รายการ</span>
              <span>{savingProgress.percent < 100 ? 'กำลังประมวลผล...' : 'เสร็จสิ้น'}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
              ระบบกำลังอัปโหลดรูปไป Drive และให้ AI ตรวจสอบความถูกต้อง (จำนวนก้าว+วันที่) — ถ้ามั่นใจสูงจะอนุมัติทันที ไม่มั่นใจจะส่งต่อให้บุคคลต่างฝ่ายตรวจสอบ
            </p>
          </div>
        </div>
      )}

      {/* Zoom preview — ดูรูปเต็มก่อนบันทึกเพื่อยืนยันเจ้าของข้อมูล */}
      {zoomPreview && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={()=> setZoomPreview(null)}>
          <div className="relative max-w-lg w-full" onClick={e=> e.stopPropagation()}>
            <img src={zoomPreview.src} alt={zoomPreview.name} className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl bg-white" />
            <p className="mt-2 text-center text-sm text-white font-medium">{zoomPreview.name}</p>
            <button onClick={()=> setZoomPreview(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center shadow">✕</button>
          </div>
        </div>
      )}
      {clearTarget && (
        <Modal open={!!clearTarget} onClose={()=> { setClearTarget(null); setClearReason(''); }}>
          <div className="text-center py-2">
            <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 bg-red-50 dark:bg-red-900/20 text-red-500">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">ยืนยันล้างข้อมูล</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">ล้างข้อมูลวันที่ {clearTarget.day} ใช่หรือไม่? ต้องระบุเหตุผล</p>
            <div className="mt-4 text-left">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">เหตุผลที่ล้าง <span className="text-red-500">*</span></label>
              <textarea value={clearReason} onChange={e=> setClearReason(e.target.value)} placeholder="ระบุเหตุผล เช่น ข้อมูลซ้ำ, รูปผิดคน, วันที่ไม่ตรง..." className="mt-1 w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" rows={3} />
              <p className="text-[11px] text-gray-400 mt-1">เหตุผลจะแสดงในตารางโดยไม่แสดงชื่อผู้ลบ (ต่างฝ่าย)</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={()=> { setClearTarget(null); setClearReason(''); }} disabled={clearing} className="btn-ghost flex-1 justify-center disabled:opacity-50">ยกเลิก</button>
              <button onClick={handleClearPersisted} disabled={clearing || !clearReason.trim()} className="flex-[2] justify-center h-[42px] rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                {clearing ? <><span className="loading loading-spinner loading-sm"></span> กำลังล้าง...</> : 'ยืนยันล้าง'}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
