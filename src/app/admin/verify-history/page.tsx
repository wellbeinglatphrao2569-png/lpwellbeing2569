'use client';
import Link from 'next/link';
import { Fragment, useState, useEffect, useMemo } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import ProofImage from '@/components/ProofImage';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postDataJson } from '@/services/api';
import type { StepsLog, User } from '@/types';
import { toThaiDateShort, toThaiDateFull, toDateKey } from '@/utils/thaiDate';
import { profileImageUrl, displayName } from '@/utils/personnel';

type HistoryItem = StepsLog & { userName: string; userDept: string; userNickname: string; userProfileImage?: string };

function driveViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
}
function safeThaiDate(v: unknown): string {
  try { return toThaiDateShort(String(v ?? '')); } catch { return String(v ?? ''); }
}
function formatThaiTime(v: unknown): string {
  try {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const thai = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return `${String(thai.getUTCHours()).padStart(2, '0')}:${String(thai.getUTCMinutes()).padStart(2, '0')} น.`;
  } catch { return ''; }
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'Approved') {
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">อนุมัติแล้ว</span>;
  }
  if (status === 'Rejected') {
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">ไม่อนุมัติ</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">รอตรวจสอบ</span>;
}

function AlertBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      <span className="material-symbols-outlined text-xs">warning</span>
      ผิดปกติ
    </span>
  );
}

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
      <span className="material-symbols-outlined text-xs">smart_toy</span>
      AI
    </span>
  );
}

function methodLabel(method?: string): string {
  const m = String(method || '').trim();
  if (!m) return 'ไม่ระบุ';
  if (m === 'ภาพถ่าย' || m.toLowerCase().includes('ภาพถ่าย') || m.includes('เจ้าหน้าที่')) return m.includes('เจ้าหน้าที่') ? 'เจ้าหน้าที่บันทึกให้ (รูป)' : 'ภาพถ่าย';
  if (m.toLowerCase().includes('google')) return 'Google Fit';
  return m;
}
function MethodBadge({ method }: { method?: string }) {
  const m = String(method || '').trim().toLowerCase();
  const isGoogle = m.includes('google');
  const isBatch = m.includes('เจ้าหน้าที่');
  if (isGoogle) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"><span className="material-symbols-outlined text-xs">watch</span>Google Fit</span>;
  if (isBatch) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800"><span className="material-symbols-outlined text-xs">group</span>รายกลุ่ม (รูป)</span>;
  if (m.includes('ภาพถ่าย') || m.includes('manual') || m.includes('ocr')) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><span className="material-symbols-outlined text-xs">image</span>ภาพถ่าย</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">{methodLabel(method)}</span>;
}

function isBatchAiAuto(item: { Record_Method?: string; Status?: string; Alert_Flag?: string | boolean }): boolean {
  const m = String(item.Record_Method || '');
  const st = String(item.Status || '').trim();
  const alert = String(item.Alert_Flag || 'FALSE').toUpperCase();
  return m.includes('เจ้าหน้าที่') && st === 'Approved' && alert !== 'TRUE';
}
function isAiReviewer(item: { Auditor_ID?: string; Record_Method?: string; Status?: string; Alert_Flag?: string | boolean }): boolean {
  const blank = !item.Auditor_ID || String(item.Auditor_ID).trim() === '';
  return blank || isBatchAiAuto(item as any);
}

export default function VerifyHistoryPage() {
  const { isLoggedIn, isAdmin, user } = useAuth() as any;
  const [steps, setSteps] = useState<StepsLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitter, setSubmitter] = useState('');
  const [status, setStatus] = useState<'all' | 'Approved' | 'Rejected'>('all');
  const [reviewer, setReviewer] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDate, setFilterDate] = useState(''); // YYYY-MM-DD (Date_Thai)
  const [filterMethod, setFilterMethod] = useState<string>(''); // '' = ทั้งหมด, 'google' | 'image' | 'batch'
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  // พับ/กางแถบย่อ: วันที่ → ฝ่าย → รายการ
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  function toggleDate(dateKey: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }
  function toggleDept(dateKey: string, dept: string) {
    const key = `${dateKey}__${dept}`;
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) {
      if (u.User_ID) m.set(String(u.User_ID), u);
      if (u.Personnel_ID) m.set(String(u.Personnel_ID), u);
    }
    return m;
  }, [users]);

  async function load() {
    setLoading(true);
    const [s, u] = await Promise.all([
      fetchData<StepsLog[]>('steps'),
      fetchData<User[]>('users'),
    ]);
    if (s) setSteps(s);
    if (u) setUsers(u);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const historyItems: HistoryItem[] = useMemo(() => {
    return steps
      .filter(s => {
        const st = String(s.Status || '').trim();
        // ประวัติ = เฉพาะที่ตรวจแล้ว (Approved/Rejected) — แสดงทุกวิธี: ภาพถ่ายรายคน/กลุ่ม, Google Fit, เจ้าหน้าที่บันทึกให้ ฯลฯ
        // ตัด Pending ออก (อยู่ในหน้า verify-steps)
        return st === 'Approved' || st === 'Rejected';
      })
      .map(s => {
        const u = userMap.get(String(s.User_ID));
        return {
          ...s,
          userName: String(u?.Full_Name || s.User_ID || '?'),
          userDept: u?.Department || '',
          userNickname: u?.Nickname || '',
          userProfileImage: profileImageUrl(u?.Profile_Image) || undefined,
        };
      })
      .sort((a, b) => {
        // เรียงตามวันที่นับก้าว (Date_Thai) ล่าสุดก่อน เป็นหลัก
        const ka = toDateKey(a.Date_Thai) || '';
        const kb = toDateKey(b.Date_Thai) || '';
        if (ka !== kb) return kb.localeCompare(ka);
        // ภายในวันเดียวกัน เรียงตามเวลาตรวจสอบ Reviewed_At ล่าสุดก่อน (fallback Recorded_At)
        const ra = String(b.Reviewed_At || b.Recorded_At || '').localeCompare(String(a.Reviewed_At || a.Recorded_At || ''));
        if (ra !== 0) return ra;
        return String(b.Record_ID).localeCompare(String(a.Record_ID));
      });
  }, [steps, userMap]);

  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.Department) set.add(String(u.Department));
    for (const item of historyItems) if (item.userDept) set.add(String(item.userDept));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [users, historyItems]);

  const filtered = useMemo(() => {
    const sq = submitter.trim().toLowerCase();
    const rq = reviewer.trim().toLowerCase();
    const dq = filterDept.trim();
    const dateKey = filterDate.trim(); // YYYY-MM-DD
    const mq = filterMethod.trim().toLowerCase();
    return historyItems.filter(i => {
      const submitMatch = !sq ||
        String(i.userName || '').toLowerCase().includes(sq) ||
        String(i.userDept || '').toLowerCase().includes(sq) ||
        String(i.User_ID || '').toLowerCase().includes(sq);
      if (!submitMatch) return false;
      if (status !== 'all' && i.Status !== status) return false;
      if (dq && String(i.userDept) !== dq) return false;
      if (dateKey) {
        const itemKey = toDateKey(i.Date_Thai);
        if (itemKey !== dateKey) return false;
      }
      if (mq) {
        const m = String(i.Record_Method || '').toLowerCase();
        const hasImage = !!String(i.Image_Drive_ID || '').trim();
        if (mq === 'google' && !m.includes('google')) return false;
        if (mq === 'image' && (m.includes('google') || (!hasImage && m.includes('เจ้าหน้าที่')))) return false;
        if (mq === 'batch' && !m.includes('เจ้าหน้าที่')) return false;
        if (mq === 'other' && (m.includes('google') || m.includes('เจ้าหน้าที่') || m.includes('ภาพถ่าย') || hasImage)) return false;
      }
      if (rq) {
        // รองรับ AI: รายกลุ่ม auto-approve ให้ถือเป็น AI ด้วยแม้ Auditor_ID จะเป็นคนบันทึก
        const isAi = isAiReviewer(i);
        const auditor = !isAi && i.Auditor_ID ? (userMap.get(String(i.Auditor_ID)) || null) : null;
        const auditorName = auditor ? displayName(auditor) : (isAi ? 'AI ระบบอัตโนมัติ' : String(i.Auditor_ID || ''));
        const auditorDept = auditor?.Department || '';
        const hay = `${auditorName} ${auditorDept} ${String(i.Auditor_ID || '')}`.toLowerCase();
        if (!hay.includes(rq)) return false;
      }
      return true;
    });
  }, [historyItems, submitter, status, reviewer, filterDept, filterDate, filterMethod, userMap]);

  // จัดกลุ่ม: วัน (Date_Thai) → ฝ่าย
  const grouped = useMemo(() => {
    const byDate = new Map<string, HistoryItem[]>();
    for (const item of filtered) {
      const key = toDateKey(item.Date_Thai) || 'unknown';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(item);
    }
    const sortedDates = Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return sortedDates.map(([dateKey, items]) => {
      const byDept = new Map<string, HistoryItem[]>();
      for (const it of items) {
        const deptKey = String(it.userDept || 'ไม่ระบุฝ่าย');
        if (!byDept.has(deptKey)) byDept.set(deptKey, []);
        byDept.get(deptKey)!.push(it);
      }
      const deptGroups = Array.from(byDept.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'th'))
        .map(([dept, deptItems]) => ({ dept, items: deptItems }));
      const totalSteps = items.reduce((s, it) => s + (Number(it.Steps_Count) || 0), 0);
      return { dateKey, items, deptGroups, totalSteps };
    });
  }, [filtered]);

  const hasActiveFilter = !!submitter.trim() || status !== 'all' || !!reviewer.trim() || !!filterDept.trim() || !!filterDate.trim() || !!filterMethod.trim();

  function clearFilters() {
    setSubmitter('');
    setStatus('all');
    setReviewer('');
    setFilterDept('');
    setFilterDate('');
    setFilterMethod('');
  }

  const sel = selected;
  const selIsAlert = !!sel && (sel.Alert_Flag === 'TRUE' || sel.Alert_Flag === true);
  const selDateMatch = sel ? (sel.Date_Match === 'TRUE' || sel.Date_Match === true ? true : sel.Date_Match === 'FALSE' || sel.Date_Match === false ? false : null) : null;
  const selConfidence = sel && sel.AI_Confidence != null && sel.AI_Confidence !== '' ? Number(sel.AI_Confidence) : null;
  const selAiSteps = sel && sel.AI_Steps != null && sel.AI_Steps !== '' ? Number(sel.AI_Steps) : null;
  const selAuditor = sel && !isAiReviewer(sel) ? (userMap.get(String(sel.Auditor_ID)) || users.find(u=> String(u.User_ID)===String(sel.Auditor_ID) || String(u.Personnel_ID)===String(sel.Auditor_ID)) || null) : null;
  const selIsAiAuditor = !!sel && isAiReviewer(sel);
  const [confirmDelete, setConfirmDelete] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(item: HistoryItem) {
    if (!isAdmin || !user) return;
    setDeleting(true);
    const res: any = await postDataJson('delete-step', { Record_ID: item.Record_ID, Logged_By: (user as any).User_ID });
    setDeleting(false);
    setConfirmDelete(null);
    if (res?.success) {
      setSelected(null);
      load();
    } else {
      alert(res?.message || 'ลบไม่สำเร็จ');
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="p-8 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
          <span className="material-symbols-outlined text-4xl text-amber-500">lock</span>
          <p className="font-bold text-gray-900 dark:text-white mt-2">ต้องเข้าสู่ระบบก่อน</p>
          <p className="text-sm text-gray-500 mt-1">หน้านี้สำหรับเจ้าหน้าที่ นสส. เท่านั้น — กรุณาเข้าสู่ระบบก่อน</p>
          <a href="/login" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">ไปหน้าเข้าสู่ระบบ</a>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
          <span className="material-symbols-outlined text-4xl text-red-500">block</span>
          <p className="font-bold text-gray-900 dark:text-white mt-2">ไม่มีสิทธิ์เข้าถึง</p>
          <p className="text-sm text-gray-500 mt-1">หน้านี้สำหรับเจ้าหน้าที่ นสส. (Admin) เท่านั้น</p>
          <a href="/dashboard" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold">กลับไปแดชบอร์ด</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">ประวัติการตรวจสอบก้าวเดิน</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">แสดงทั้งหมด <b>ภาพถ่ายรายคน/รายกลุ่ม + Google Fit</b> ที่ตรวจแล้ว (อนุมัติ/ไม่อนุมัติ) — จัดหมวด <b>รายวัน</b> แยกย่อย <b>รายฝ่าย</b> — คลิกการ์ดเพื่อดูรายละเอียดและลบได้ทุกวิธี</p>
        </div>
        <Link href="/admin/verify-steps"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors shrink-0">
          <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
          รายการรอตรวจสอบ
        </Link>
      </div>

      {/* ตัวกรอง — ครบชุด */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          ค้นหาชื่อผู้ใช้งาน (ผู้บันทึก)
          <div className="relative">
            <span className="material-symbols-outlined text-base text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
            <input value={submitter} onChange={e => setSubmitter(e.target.value)} placeholder="พิมพ์ชื่อ-สกุล หรือฝ่าย"
              className="pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-[190px]" />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          ฝ่าย
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[160px]">
            <option value="">ทุกฝ่าย</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
            <option value="ไม่ระบุฝ่าย">ไม่ระบุฝ่าย</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          วันที่นับก้าว
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          วิธีบันทึก
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[150px]">
            <option value="">ทั้งหมด (รูป+Google Fit)</option>
            <option value="image">ภาพถ่ายรายคน</option>
            <option value="batch">รายกลุ่ม (เจ้าหน้าที่บันทึกให้)</option>
            <option value="google">Google Fit</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          สถานะ
          <select value={status} onChange={e => setStatus(e.target.value as 'all' | 'Approved' | 'Rejected')}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="all">ทั้งหมด</option>
            <option value="Approved">อนุมัติแล้ว</option>
            <option value="Rejected">ไม่อนุมัติ</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          ค้นหาชื่อผู้ตรวจสอบ
          <div className="relative">
            <span className="material-symbols-outlined text-base text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
            <input value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="พิมพ์ชื่อผู้ตรวจสอบ / AI"
              className="pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-[190px]" />
          </div>
        </label>
        {hasActiveFilter && (
          <button onClick={clearFilters}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-base">filter_alt_off</span>
            ล้างตัวกรอง
          </button>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">พบ {filtered.length} รายการ · {grouped.length} วัน</span>
      </div>

      {loading ? (
        <GlassCard className="p-10 text-center text-gray-400"><span className="loading loading-spinner loading-lg text-emerald-600"></span></GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-10 text-center text-gray-400">
          <span className="material-symbols-outlined text-4xl block mb-2">history</span>
          ไม่พบรายการตามเงื่อนไขที่เลือก
        </GlassCard>
      ) : (
        <>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => { const all = new Set(grouped.map(g=>g.dateKey)); setExpandedDates(all); const allDepts = new Set(grouped.flatMap(g=> g.deptGroups.map(dg=> `${g.dateKey}__${dg.dept}`))); setExpandedDepts(allDepts); }} className="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100">กางทั้งหมด</button>
          <button onClick={() => { setExpandedDates(new Set()); setExpandedDepts(new Set()); }} className="px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-xs font-bold hover:bg-gray-100">พับทั้งหมด</button>
        </div>
        <div className="space-y-3">
          {grouped.map(group => (
            <div key={group.dateKey} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              {/* หัวข้อวัน — แถบย่อ กดเพื่อกาง/พับ */}
              <button onClick={() => toggleDate(group.dateKey)} className="w-full px-4 py-3 bg-emerald-50/70 dark:bg-emerald-900/20 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30 transition-colors">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">{expandedDates.has(group.dateKey) ? 'expand_less' : 'expand_more'}</span>
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">calendar_month</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{group.dateKey === 'unknown' ? 'วันที่ไม่ระบุ' : toThaiDateFull(group.dateKey)}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{group.items.length} รายการ</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">รวม {group.totalSteps.toLocaleString()} ก้าว</span>
                <span className="text-xs text-gray-400">· {group.deptGroups.length} ฝ่าย</span>
                <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-bold">{expandedDates.has(group.dateKey) ? 'ซ่อน' : 'ดูฝ่าย'}</span>
              </button>
              {/* รายฝ่าย — แสดงเมื่อกางวันที่ */}
              {expandedDates.has(group.dateKey) && (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {group.deptGroups.map(dg => (
                  <div key={dg.dept} className="">
                    <button onClick={() => toggleDept(group.dateKey, dg.dept)} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center gap-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                      <span className="material-symbols-outlined text-gray-500 text-base">{expandedDepts.has(`${group.dateKey}__${dg.dept}`) ? 'expand_less' : 'expand_more'}</span>
                      <span className="material-symbols-outlined text-gray-400 text-base">group</span>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{dg.dept}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500">{dg.items.length} คน</span>
                      <span className="text-xs text-gray-400">รวม {dg.items.reduce((s,it)=>s+(Number(it.Steps_Count)||0),0).toLocaleString()} ก้าว</span>
                      <span className="ml-auto text-xs text-gray-500 font-bold">{expandedDepts.has(`${group.dateKey}__${dg.dept}`) ? 'ซ่อน' : 'ดูรายการ'}</span>
                    </button>
                    {expandedDepts.has(`${group.dateKey}__${dg.dept}`) && (
                    <div className="p-3 space-y-3 bg-gray-50/30 dark:bg-gray-800/30">
                      {dg.items.map(item => {
                        const isAlert = item.Alert_Flag === 'TRUE' || item.Alert_Flag === true;
                        const dateMatch = item.Date_Match === 'TRUE' || item.Date_Match === true ? true : item.Date_Match === 'FALSE' || item.Date_Match === false ? false : null;
                        const confidence = item.AI_Confidence != null && item.AI_Confidence !== '' ? Number(item.AI_Confidence) : null;
                        const aiSteps = item.AI_Steps != null && item.AI_Steps !== '' ? Number(item.AI_Steps) : null;
                        const isAiAuditor = isAiReviewer(item);
                        const auditor = !isAiAuditor ? (userMap.get(String(item.Auditor_ID)) || users.find(u => String(u.User_ID) === String(item.Auditor_ID) || String(u.Personnel_ID) === String(item.Auditor_ID)) || null) : null;
                        const isApproved = item.Status === 'Approved';
                        // เวลาตรวจ: ใช้ Reviewed_At ก่อน ถ้าว่างและเป็น AI ให้ fallback Recorded_At
                        const reviewedAtRaw = item.Reviewed_At && String(item.Reviewed_At).trim() !== '' ? item.Reviewed_At : (isAiAuditor ? (item.Recorded_At || '') : '');
                        return (
                          <div key={item.Record_ID} onClick={() => setSelected(item)}
                            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 cursor-pointer hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition-all">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {item.userProfileImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.userProfileImage} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold shrink-0">{String(item.userName || '?').charAt(0)}</div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-900 dark:text-white truncate">{item.userName}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {item.userNickname ? `ชื่อเล่น: ${item.userNickname} · ` : ''}{item.userDept || 'ไม่ระบุฝ่าย'} · วันที่นับก้าว {safeThaiDate(item.Date_Thai)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <MethodBadge method={item.Record_Method} />
                                {isAlert && <AlertBadge />}
                                <StatusBadge status={item.Status} />
                              </div>
                            </div>
                            {(() => {
                              const submitted = item.Submitted_Steps != null && String(item.Submitted_Steps).trim() !== '' ? Number(item.Submitted_Steps) : Number(item.Steps_Count);
                              const finalSteps = Number(item.Steps_Count);
                              const isEdited = !isNaN(submitted) && !isNaN(finalSteps) && submitted !== finalSteps;
                              const isGoogleFit = String(item.Record_Method || '').toLowerCase().includes('google');
                              return (
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                                  <span>ส่งครั้งแรก <b className="text-gray-700 dark:text-gray-200">{submitted.toLocaleString()}</b> ก้าว</span>
                                  <span className={isEdited ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>ตรวจสอบแล้ว <b>{finalSteps.toLocaleString()}</b> ก้าว {isEdited && <span className="text-xs font-normal">({finalSteps > submitted ? `+${(finalSteps - submitted).toLocaleString()}` : `${(finalSteps - submitted).toLocaleString()}`})</span>}</span>
                                  {isEdited && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${finalSteps === submitted ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'}`}>{finalSteps === submitted ? 'ตรงกัน' : 'ต่างกัน'}</span>}
                                  {!isGoogleFit && <span>AI อ่านได้ <b className="text-purple-600 dark:text-purple-400">{aiSteps != null ? aiSteps.toLocaleString() : '—'}</b> ({confidence != null ? Math.round(confidence * 100) : '—'}%)</span>}
                                  <span>วันที่ในภาพ: {dateMatch === true ? <b className="text-emerald-600 dark:text-emerald-400">ตรงกัน</b> : dateMatch === false ? <b className="text-red-600 dark:text-red-400">ไม่ตรง</b> : <b className="text-amber-600 dark:text-amber-400">ไม่พบ/ไม่ชัด</b>}</span>
                                </div>
                              );
                            })()}
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <div>
                                ตรวจสอบโดย <span className="font-bold inline-flex items-center gap-1">{isAiAuditor ? <><AiBadge /> <span>AI (ระบบอัตโนมัติ)</span></> : (auditor ? `${displayName(auditor)}${auditor.Department ? ` (${auditor.Department})` : ''}` : (item.Auditor_ID || '—'))}</span>
                                {reviewedAtRaw && <span> เมื่อวันที่ {safeThaiDate(reviewedAtRaw)} เวลา {formatThaiTime(reviewedAtRaw)}</span>}
                                {!reviewedAtRaw && !isAiAuditor && <span> — ยังไม่มีเวลาตรวจ</span>}
                                {item.Status === 'Rejected' && item.Reject_Reason && (
                                  <span className="text-red-500"> · เหตุผล: {item.Reject_Reason}</span>
                                )}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30">
                                <span className="material-symbols-outlined text-sm">delete</span> ลบ
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* Popup รายละเอียด (ดูอย่างเดียว) */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 min-w-0">
                {sel.userProfileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sel.userProfileImage} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-lg shrink-0">{String(sel.userName || '?').charAt(0)}</div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{sel.userName}</p>
                  {sel.userNickname && <p className="text-xs text-gray-500 dark:text-gray-400">ชื่อเล่น: {sel.userNickname}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sel.userDept || 'ไม่ระบุฝ่าย'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <MethodBadge method={sel.Record_Method} />
                {selIsAlert && <AlertBadge />}
                {selIsAiAuditor && <AiBadge />}
                <StatusBadge status={sel.Status} />
                <button onClick={() => setSelected(null)} aria-label="ปิด"
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>วิธีบันทึก:</span> <MethodBadge method={sel.Record_Method} />
                {sel.Record_Method && <span className="text-gray-400">({sel.Record_Method})</span>}
              </div>
              {sel.Image_Drive_ID ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                  <ProofImage fileId={sel.Image_Drive_ID} alt={`หลักฐานก้าว ${sel.userName}`} onClick={src => window.open(src, '_blank')} />
                  <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/50 text-white text-xs font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">zoom_in</span>
                    คลิกเพื่อซูม
                  </span>
                  <button onClick={() => window.open(driveViewUrl(sel.Image_Drive_ID!), '_blank')}
                    className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                    เปิดใน Google Drive
                  </button>
                </div>
              ) : String(sel.Record_Method||'').toLowerCase().includes('google') ? (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl">watch</span>
                  <span><b>Google Fit</b> — ซิงค์อัตโนมัติ ไม่มีรูปภาพหลักฐาน</span>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">image_not_supported</span>
                  ไม่มีรูปภาพหลักฐาน
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">วันที่นับก้าว</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{safeThaiDate(sel.Date_Thai)}</p>
                  <p className="text-[11px] text-gray-400">วันที่ต้องการบันทึกก้าว</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">ส่งครั้งแรก (ผู้ใช้งานพิมพ์)</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-gray-700 dark:text-gray-200">{Number(sel.Submitted_Steps != null && String(sel.Submitted_Steps).trim() !== '' ? sel.Submitted_Steps : sel.Steps_Count).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">ก่อนตรวจสอบ</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-gray-400 mb-0.5">ตรวจสอบแล้ว {(() => { const sub = sel.Submitted_Steps != null && String(sel.Submitted_Steps).trim() !== '' ? Number(sel.Submitted_Steps) : Number(sel.Steps_Count); const fin = Number(sel.Steps_Count); return sub !== fin ? (fin > sub ? `(+${(fin - sub).toLocaleString()})` : `(${(fin - sub).toLocaleString()})`) : '(ตรงกัน)'; })()}</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{Number(sel.Steps_Count).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">หลังตรวจสอบ {sel.Submitted_Steps != null && String(sel.Submitted_Steps).trim() !== '' && Number(sel.Submitted_Steps) !== Number(sel.Steps_Count) ? '— มีการแก้ไข' : '— ไม่มีการแก้ไข'}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">AI อ่านได้</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400">{selAiSteps != null ? selAiSteps.toLocaleString() : '—'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">ความมั่นใจ {selConfidence != null ? Math.round(selConfidence * 100) : '—'}%</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">วันที่ในภาพ</p>
                  {selDateMatch === true ? (
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">ตรงกัน</p>
                  ) : selDateMatch === false ? (
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">ไม่ตรง</p>
                  ) : (
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">ไม่พบ/ไม่ชัด</p>
                  )}
                </div>
              </div>

              {selIsAlert && sel.Alert_Reason && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                  <span className="font-bold">โน้ตแจ้งเตือน: </span>{sel.Alert_Reason}
                </div>
              )}

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                <p><span className="text-gray-400">ผลการตรวจสอบ:</span> {sel.Status === 'Approved' ? <span className="font-bold text-emerald-600 dark:text-emerald-400">อนุมัติ</span> : <span className="font-bold text-red-600 dark:text-red-400">ไม่อนุมัติ</span>}</p>
                <p className="mt-1"><span className="text-gray-400">วันที่นับก้าว:</span> <span className="font-bold">{safeThaiDate(sel.Date_Thai)}</span></p>
                <p className="mt-1"><span className="text-gray-400">ตรวจสอบโดย:</span> <span className="font-bold inline-flex items-center gap-1">{selIsAiAuditor ? <><AiBadge /> AI (ระบบอัตโนมัติ)</> : (selAuditor ? `${displayName(selAuditor)}${selAuditor.Department ? ` (${selAuditor.Department})` : ''}` : (sel.Auditor_ID || '—'))}</span>
                  {(() => {
                    const raw = sel.Reviewed_At && String(sel.Reviewed_At).trim() !== '' ? sel.Reviewed_At : (selIsAiAuditor ? (sel.Recorded_At || '') : '');
                    return raw ? <span> เมื่อวันที่ {safeThaiDate(raw)} เวลา {formatThaiTime(raw)}</span> : null;
                  })()}
                </p>
                {sel.Status === 'Rejected' && sel.Reject_Reason && (
                  <p className="mt-1 text-red-500"><span className="text-gray-400">เหตุผลที่ไม่อนุมัติ:</span> <span className="font-bold">{sel.Reject_Reason}</span></p>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={() => setConfirmDelete(sel)} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30">
                  <span className="material-symbols-outlined text-base">delete</span> {String(sel.Record_Method||'').toLowerCase().includes('google') ? 'ลบข้อมูล Google Fit นี้เพื่อให้ซิงค์ใหม่ได้' : 'ลบข้อมูลนี้ (พร้อมรูป) เพื่อให้กรอกใหม่ได้'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmPopup open={!!confirmDelete} title="ยืนยันการลบ" message={`คุณกำลังจะลบประวัติก้าวของ "${confirmDelete?.userName || ''}" วันที่ ${confirmDelete ? safeThaiDate(confirmDelete.Date_Thai) : ''} จำนวน ${confirmDelete ? Number(confirmDelete.Steps_Count).toLocaleString() : ''} ก้าว ${confirmDelete?.Image_Drive_ID ? 'พร้อมรูปภาพ' : String(confirmDelete?.Record_Method||'').toLowerCase().includes('google') ? '(Google Fit)' : ''} — ลบแล้วต้องกรอกใหม่ แน่ใจหรือไม่?`} variant="danger" loading={deleting} onConfirm={() => confirmDelete && handleDelete(confirmDelete)} onClose={() => setConfirmDelete(null)} />
    </div>
  );
}
