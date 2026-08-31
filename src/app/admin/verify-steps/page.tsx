'use client';
import Link from 'next/link';
import { Fragment, useState, useEffect, useMemo } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import ProofImage from '@/components/ProofImage';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData } from '@/services/api';
import type { StepsLog, User } from '@/types';
import { toThaiDateShort, toThaiDateFull } from '@/utils/thaiDate';
import { profileImageUrl } from '@/utils/personnel';

type VerifyItem = StepsLog & { userName: string; userDept: string; userNickname: string; userProfileImage?: string };

/** แปลงค่า Date_Thai เป็น key "YYYY-MM-DD" (ตามวันท้องถิ่น) สำหรับจัดกลุ่มรายการตามวันที่ส่งก้าว */
function normalizeDateKey(value: unknown): string {
  if (!value) return '';
  const toLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (value instanceof Date && !isNaN(value.getTime())) return toLocal(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : toLocal(d);
}

function driveViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
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

function SameDeptBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="คุณอยู่ฝ่ายเดียวกับผู้ส่งก้าว — ต้องให้บุคคลต่างฝ่ายตรวจสอบ">
      <span className="material-symbols-outlined text-xs">lock</span>
      ฝ่ายเดียวกัน
    </span>
  );
}

function UserAvatar({ item, size = 'md' }: { item: VerifyItem; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-11 h-11 text-lg' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10';
  if (item.userProfileImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.userProfileImage} alt="" className={`${cls} rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0`} />;
  }
  return (
    <div className={`${cls} rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold shrink-0`}>
      {String(item.userName || 'ส').charAt(0)}
    </div>
  );
}

function AiReasonCell({ item }: { item: VerifyItem }) {
  const confidence = item.AI_Confidence != null && item.AI_Confidence !== '' ? Number(item.AI_Confidence) : null;
  const aiSteps = item.AI_Steps != null && item.AI_Steps !== '' ? Number(item.AI_Steps) : null;
  const dateMatch = item.Date_Match === 'TRUE' || item.Date_Match === true ? true : item.Date_Match === 'FALSE' || item.Date_Match === false ? false : null;
  const isAlert = item.Alert_Flag === 'TRUE' || item.Alert_Flag === true;
  return (
    <div className="min-w-[220px] space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="text-gray-500 dark:text-gray-400">AI อ่านได้:</span>
        <span className="font-bold text-purple-600 dark:text-purple-400">{aiSteps != null ? aiSteps.toLocaleString() : '—'}</span>
        <span className="text-[10px] text-gray-400">(ความมั่นใจ {confidence != null ? Math.round(confidence * 100) : '—'}%)</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="text-gray-500 dark:text-gray-400">วันที่ในภาพ:</span>
        {dateMatch === true ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">ตรงกัน</span>
        ) : dateMatch === false ? (
          <span className="font-semibold text-red-600 dark:text-red-400">ไม่ตรง</span>
        ) : (
          <span className="font-semibold text-amber-600 dark:text-amber-400">ไม่พบ/ไม่ชัด</span>
        )}
      </div>
      {isAlert && item.Alert_Reason && (
        <div className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
          <span className="material-symbols-outlined text-sm shrink-0">warning</span>
          <span>{item.Alert_Reason}</span>
        </div>
      )}
      {!isAlert && !aiSteps && !item.Alert_Reason && (
        <div className="text-xs text-gray-400">— ไม่มีข้อมูลจาก AI —</div>
      )}
    </div>
  );
}

export default function VerifyStepsPage() {
  const { user, isLoggedIn, isAdmin } = useAuth();
  const [steps, setSteps] = useState<StepsLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VerifyItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editedSteps, setEditedSteps] = useState<string>('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; variant?: 'primary' | 'danger' | 'warning'; onConfirm: () => void } | null>(null);

  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) {
      if ((u as any).User_ID) m.set(String((u as any).User_ID), u);
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

  const imageItems: VerifyItem[] = useMemo(() => {
    return steps
      .filter(s => s.Record_Method === 'ภาพถ่าย' || (s.Image_Drive_ID && String(s.Image_Drive_ID).trim() !== ''))
      .map(s => {
        const u = userMap.get(String(s.User_ID));
        return {
          ...s,
          userName: String(u?.Full_Name || s.User_ID || 'ส'),
          userDept: u?.Department || '',
          userNickname: u?.Nickname || '',
          userProfileImage: profileImageUrl(u?.Profile_Image) || undefined,
        };
      })
      .sort((a, b) => String(b.Recorded_At || b.Date_Thai || '').localeCompare(String(a.Recorded_At || a.Date_Thai || '')));
  }, [steps, userMap]);

  // รายการทั้งหมดที่รอตรวจสอบ — รวมฝ่ายเดียวกันด้วย (จะแสดงแต่ล็อกปุ่มตามเงื่อนไข)
  const pendingItems = useMemo(() => imageItems.filter(i => i.Status === 'Pending'), [imageItems]);

  // จัดกลุ่ม/เรียงตามวันที่ส่งก้าว (ล่าสุดก่อน)
  const groupedPending = useMemo(() => {
    const map = new Map<string, VerifyItem[]>();
    for (const item of pendingItems) {
      const key = normalizeDateKey(item.Date_Thai) || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [pendingItems]);

  const alertCount = pendingItems.filter(i => (i.Alert_Flag === 'TRUE' || i.Alert_Flag === true)).length;
  const viewerDept = user?.Department;
  const sameDeptCount = pendingItems.filter(i => String(i.userDept) === String(viewerDept)).length;

  const canVerifyItem = (item: VerifyItem) => !!user && String(item.userDept) !== String(viewerDept);

  function openDetail(item: VerifyItem) {
    setRejectFor(null);
    setRejectReason('');
    setEditedSteps('');
    setSelected(item);
  }

  function openReject(item: VerifyItem) {
    openDetail(item);
    setRejectFor(item.Record_ID);
  }

  const [verifyItem, setVerifyItem] = useState<VerifyItem | null>(null);
  const [verifyEditedSteps, setVerifyEditedSteps] = useState('');
  const [verifyMode, setVerifyMode] = useState<'approve' | 'reject'>('approve');
  const [verifyRejectReason, setVerifyRejectReason] = useState('');
  const [resultPopup, setResultPopup] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openVerifyApprove = (item: VerifyItem) => {
    setVerifyEditedSteps('');
    setVerifyMode('approve');
    setVerifyRejectReason('');
    setVerifyItem(item);
  };

  const requestVerify = (item: VerifyItem, status: 'Approved' | 'Rejected', reason = '', stepsValue = editedSteps) => {
    if (!user) return;
    if (status === 'Approved') {
      const displaySteps = stepsValue.trim() !== '' ? parseInt(stepsValue, 10) : Number(item.Steps_Count);
      const editedNote = stepsValue.trim() !== '' ? ` (แก้ไขจาก ${Number(item.Steps_Count).toLocaleString()} → ${displaySteps.toLocaleString()} ก้าว)` : '';
      const alertNote = (item.Alert_Flag === 'TRUE' || item.Alert_Flag === true) && item.Alert_Reason ? `\n⚠️ ${item.Alert_Reason}` : '';
      setConfirm({
        title: 'ยืนยันการอนุมัติ',
        message: `ยืนยันอนุมัติ ${displaySteps.toLocaleString()} ก้าว${editedNote}\nผู้ส่ง: ${item.userName} (${item.userDept || 'ไม่ระบุฝ่าย'}) · วันที่บันทึก ${toThaiDateShort(item.Date_Thai)}${alertNote}\n\nโปรดตรวจสอบภาพหลักฐานให้ครบถ้วนก่อนยืนยัน`,
        variant: 'primary',
        onConfirm: () => handleVerify(item, 'Approved', '', stepsValue),
      });
      return;
    }
    setConfirm({
      title: 'ยืนยันการไม่อนุมัติ',
      message: `ยืนยันไม่อนุมัติ ${Number(item.Steps_Count).toLocaleString()} ก้าว\nผู้ส่ง: ${item.userName} (${item.userDept || 'ไม่ระบุฝ่าย'}) · วันที่ ${toThaiDateShort(item.Date_Thai)}\nเหตุผล: ${reason || '—'}\n\nเหตุผลนี้จะแสดงที่ประวัติของผู้ใช้และกลุ่มฝ่าย`,
      variant: 'danger',
      onConfirm: () => handleVerify(item, 'Rejected', reason),
    });
  };

  async function handleVerify(item: VerifyItem, status: 'Approved' | 'Rejected', reason = '', stepsValue = editedSteps) {
    setConfirm(null);
    setVerifyItem(null);
    if (!user) return;
    const newSteps = parseInt(stepsValue, 10);
    if (status === 'Approved' && stepsValue.trim() !== '' && (isNaN(newSteps) || newSteps <= 0)) {
      setNotice({ type: 'error', text: 'จำนวนก้าวที่แก้ไขต้องเป็นตัวเลขที่มากกว่า 0' });
      setResultPopup({ type: 'error', text: 'จำนวนก้าวที่แก้ไขต้องเป็นตัวเลขที่มากกว่า 0' });
      return;
    }
    setBusyId(item.Record_ID);
    setNotice(null);
    setResultPopup(null);
    const res = await postData('update-step-status', {
      Record_ID: item.Record_ID,
      Status: status,
      Auditor_ID: user.User_ID,
      Reject_Reason: reason,
      Steps_Count: stepsValue.trim() !== '' ? newSteps : undefined,
    });
    setBusyId(null);
    if (res?.success) {
      const msg = res.message || 'บันทึกสำเร็จ';
      setNotice({ type: 'success', text: msg });
      setResultPopup({ type: 'success', text: msg });
      setTimeout(() => setResultPopup(null), 2500);
      setSelected(null);
      setRejectFor(null);
      setRejectReason('');
      setEditedSteps('');
      setVerifyEditedSteps('');
      setVerifyItem(null);
      load();
    } else {
      const msg = res?.message || 'ดำเนินการไม่สำเร็จ';
      setNotice({ type: 'error', text: msg });
      setResultPopup({ type: 'error', text: msg });
    }
  }

  async function handleVerifyApprove(preferMode?: 'approve' | 'reject') {
    if (!verifyItem || !user) return;
    const mode = preferMode || verifyMode;
    if (mode === 'reject') {
      if (!verifyRejectReason.trim()) {
        setNotice({ type: 'error', text: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ (จำเป็นต้องตอบ)' });
        setResultPopup({ type: 'error', text: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' });
        return;
      }
      setBusyId(verifyItem.Record_ID);
      setNotice(null);
      setResultPopup(null);
      const res = await postData('update-step-status', {
        Record_ID: verifyItem.Record_ID,
        Status: 'Rejected',
        Auditor_ID: user.User_ID,
        Reject_Reason: verifyRejectReason.trim(),
        Steps_Count: verifyEditedSteps.trim() !== '' ? parseInt(verifyEditedSteps, 10) : undefined,
      });
      setBusyId(null);
      if (res?.success) {
        const msg = res.message || 'ไม่อนุมัติสำเร็จ — เหตุผลจะแสดงที่ประวัติของผู้ใช้และกลุ่มฝ่าย';
        setNotice({ type: 'success', text: msg });
        setResultPopup({ type: 'success', text: msg });
        setTimeout(() => setResultPopup(null), 2500);
        setVerifyItem(null);
        setVerifyEditedSteps('');
        setVerifyRejectReason('');
        setVerifyMode('approve');
        load();
      } else {
        const msg = res?.message || 'ดำเนินการไม่สำเร็จ';
        setNotice({ type: 'error', text: msg });
        setResultPopup({ type: 'error', text: msg });
      }
      return;
    }
    const stepsValue = verifyEditedSteps;
    const newSteps = parseInt(stepsValue, 10);
    if (stepsValue.trim() !== '' && (isNaN(newSteps) || newSteps <= 0)) {
      setNotice({ type: 'error', text: 'จำนวนก้าวที่แก้ไขต้องเป็นตัวเลขที่มากกว่า 0' });
      setResultPopup({ type: 'error', text: 'จำนวนก้าวที่แก้ไขต้องเป็นตัวเลขที่มากกว่า 0' });
      return;
    }
    setBusyId(verifyItem.Record_ID);
    setNotice(null);
    setResultPopup(null);
    const res = await postData('update-step-status', {
      Record_ID: verifyItem.Record_ID,
      Status: 'Approved',
      Auditor_ID: user.User_ID,
      Steps_Count: stepsValue.trim() !== '' ? newSteps : undefined,
    });
    setBusyId(null);
    if (res?.success) {
      const msg = res.message || 'อนุมัติสำเร็จ';
      setNotice({ type: 'success', text: msg });
      setResultPopup({ type: 'success', text: msg });
      setTimeout(() => setResultPopup(null), 2500);
      setVerifyItem(null);
      setVerifyEditedSteps('');
      setVerifyRejectReason('');
      setVerifyMode('approve');
      load();
    } else {
      const msg = res?.message || 'ดำเนินการไม่สำเร็จ';
      setNotice({ type: 'error', text: msg });
      setResultPopup({ type: 'error', text: msg });
    }
  }

  const sel = selected;
  const selIsAlert = !!sel && (sel.Alert_Flag === 'TRUE' || sel.Alert_Flag === true);
  const selDateMatch = sel ? (sel.Date_Match === 'TRUE' || sel.Date_Match === true ? true : sel.Date_Match === 'FALSE' || sel.Date_Match === false ? false : null) : null;
  const selConfidence = sel && sel.AI_Confidence != null && sel.AI_Confidence !== '' ? Number(sel.AI_Confidence) : null;
  const selAiSteps = sel && sel.AI_Steps != null && sel.AI_Steps !== '' ? Number(sel.AI_Steps) : null;
  const selCanVerify = sel ? canVerifyItem(sel) : false;
  const selBusy = !!sel && busyId === sel.Record_ID;
  const selRejecting = !!sel && rejectFor === sel.Record_ID;

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
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">ตรวจสอบและอนุมัติก้าวเดิน (ภาพ)</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">รายการที่ยังรอตรวจสอบ เรียงตามวันที่ส่งก้าว — คลิกแถวเพื่อดูภาพหลักฐานและรายละเอียด AI (ผู้ตรวจต้องเป็นบุคคลต่างฝ่ายกับผู้บันทึก)</p>
        </div>
        <Link href="/admin/verify-history"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors shrink-0">
          <span className="material-symbols-outlined text-lg">history</span>
          ประวัติการตรวจสอบ
        </Link>
      </div>

      {notice && (
        <div className={`p-3 rounded-xl text-sm font-medium ${notice.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
          {notice.text}
        </div>
      )}

      {alertCount > 0 && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-sm text-red-700 dark:text-red-400 font-medium">
          <span className="material-symbols-outlined align-middle mr-1 text-lg">notification_important</span>
          มี {alertCount} รายการที่ตรวจพบความผิดปกติ (วันที่ไม่ตรง / อ่านไม่ชัดเจน) ควรตรวจสอบเป็นพิเศษ
        </div>
      )}

      {sameDeptCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400 font-medium">
          <span className="material-symbols-outlined align-middle mr-1 text-lg">info</span>
          มี {sameDeptCount} รายการของผู้ส่งก้าวในฝ่ายเดียวกับคุณ — แสดงให้เห็นแต่ล็อกปุ่ม (ตามเงื่อนไขต้องให้บุคคลต่างฝ่ายตรวจสอบ)
        </div>
      )}

      {loading ? (
        <GlassCard className="p-10 text-center text-gray-400"><span className="loading loading-spinner loading-lg text-emerald-600"></span></GlassCard>
      ) : pendingItems.length === 0 ? (
        <GlassCard className="p-10 text-center text-gray-400">
          <span className="material-symbols-outlined text-4xl block mb-2">task_alt</span>
          ไม่มีรายการที่รอตรวจสอบ
        </GlassCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">ผู้ส่งก้าว</th>
                <th className="px-4 py-3 font-semibold text-right">จำนวนก้าว</th>
                <th className="px-4 py-3 font-semibold">เหตุผลจาก AI ตรวจสอบ</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {groupedPending.map(group => (
                <Fragment key={group.date}>
                  {/* หัวข้อกลุ่ม: วันที่ส่งก้าว */}
                  <tr className="bg-emerald-50/70 dark:bg-emerald-900/20">
                    <td colSpan={5} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg">calendar_month</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{group.date === 'unknown' ? 'วันที่ไม่ระบุ' : toThaiDateFull(group.date)}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{group.items.length} รายการ</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">รวม {group.items.reduce((s, i) => s + (Number(i.Steps_Count) || 0), 0).toLocaleString()} ก้าว</span>
                      </div>
                    </td>
                  </tr>
                  {group.items.map(item => {
                    const isAlert = item.Alert_Flag === 'TRUE' || item.Alert_Flag === true;
                    const canVerify = canVerifyItem(item);
                    const busy = busyId === item.Record_ID;

                    return (
                      <tr key={item.Record_ID} onClick={() => openDetail(item)}
                        className="border-b border-gray-100 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar item={item} />
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 dark:text-white truncate max-w-[200px]">
                                {item.userName}
                                {!canVerify && <SameDeptBadge />}
                              </p>
                              {item.userNickname && <p className="text-[11px] text-gray-500 dark:text-gray-400">ชื่อเล่น: {item.userNickname}</p>}
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.userDept || 'ไม่ระบุฝ่าย'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{Number(item.Steps_Count).toLocaleString()}</td>
                        <td className="px-4 py-3"><AiReasonCell item={item} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {isAlert && <AlertBadge />}
                            <StatusBadge status={item.Status} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              disabled={!canVerify || busy}
                              onClick={(e) => { e.stopPropagation(); openDetail(item); }}
                              title={canVerify ? 'เปิดหน้าต่างตรวจสอบ (อนุมัติ/ไม่อนุมัติ)' : 'ฝ่ายเดียวกันกับผู้ส่งก้าว — ไม่สามารถตรวจสอบได้'}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1">
                              {busy ? <span className="loading loading-spinner loading-xs"></span> : <span className="material-symbols-outlined text-sm">fact_check</span>}
                              อนุมัติ
                            </button>
                            <button
                              disabled={!canVerify || busy}
                              onClick={(e) => { e.stopPropagation(); openDetail(item); }}
                              title={canVerify ? 'เปิดหน้าต่างตรวจสอบ (อนุมัติ/ไม่อนุมัติ)' : 'ฝ่ายเดียวกันกับผู้ส่งก้าว — ไม่สามารถตรวจสอบได้'}
                              className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">cancel</span>
                              ไม่อนุมัติ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Popup รายละเอียด + ตรวจสอบ */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar item={sel} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{sel.userName}</p>
                  {sel.userNickname && <p className="text-xs text-gray-500 dark:text-gray-400">ชื่อเล่น: {sel.userNickname}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sel.userDept || 'ไม่ระบุฝ่าย'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selIsAlert && <AlertBadge />}
                <StatusBadge status={sel.Status} />
                <button onClick={() => setSelected(null)} aria-label="ปิด"
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* ภาพหลักฐาน */}
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
              ) : (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">image_not_supported</span>
                  ไม่มีรูปภาพหลักฐาน (อัปโหลดภาพไม่สำเร็จ)
                </div>
              )}

              {/* ข้อมูล */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">วันที่บันทึก</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{toThaiDateShort(sel.Date_Thai)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">จำนวนก้าวที่ส่ง</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{Number(sel.Steps_Count).toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">AI อ่านได้</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400">{selAiSteps != null ? selAiSteps.toLocaleString() : '—'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">ความมั่นใจ {selConfidence != null ? Math.round(selConfidence * 100) : '—'}%</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
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

              {/* แก้ไขจำนวนก้าวก่อนอนุมัติ */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  แก้ไขจำนวนก้าว (ส่งค่ายืนยันแทนค่าต้นฉบับ)
                </p>
                <input
                  type="number" min="0"
                  value={editedSteps}
                  onChange={e => setEditedSteps(e.target.value)}
                  placeholder={`จำนวนก้าวที่ถูกต้อง (เดิม ${Number(sel.Steps_Count).toLocaleString()})`}
                  className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-extrabold text-gray-900 dark:text-white text-center outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>

              {/* ปุ่มตรวจสอบ */}
              <div className="flex flex-col gap-2">
                {!selCanVerify ? (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">lock</span>
                    {user ? 'คุณอยู่ฝ่ายเดียวกับผู้ส่งก้าว — ต้องให้บุคคลต่างฝ่ายตรวจสอบ' : 'โปรดเข้าสู่ระบบในฐานะผู้ดูแลระบบ'}
                  </div>
                ) : selRejecting ? (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-1.5">เหตุผลที่ไม่อนุมัติ (จำเป็น)</p>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                      placeholder="เช่น รูปไม่ชัดเจน / วันที่ในภาพไม่ตรง / จำนวนก้าวไม่สมเหตุสมผล"
                      className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => requestVerify(sel, 'Rejected', rejectReason)} disabled={!rejectReason.trim() || selBusy}
                        className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold text-sm disabled:opacity-50">
                        {selBusy ? 'กำลังบันทึก...' : 'ยืนยันไม่อนุมัติ'}
                      </button>
                      <button onClick={() => { setRejectFor(null); setRejectReason(''); }} disabled={selBusy}
                        className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => requestVerify(sel, 'Approved', '', editedSteps)} disabled={selBusy}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-lg">check_circle</span>อนุมัติ
                    </button>
                    <button onClick={() => setRejectFor(sel.Record_ID)} disabled={selBusy}
                      className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-lg">cancel</span>ไม่อนุมัติ
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmPopup
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message || ''}
        variant={confirm?.variant}
        loading={!!busyId}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />

      {/* Popup ระหว่างรอประมวลผล — โปร่งใส เบา กันสับสน */}
      {busyId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/15 backdrop-blur-[1px] p-4">
          <div className="bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3 border border-gray-200 dark:border-gray-700">
            <span className="loading loading-spinner loading-lg text-emerald-600"></span>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">กำลังบันทึก...</p>
            <p className="text-xs text-gray-400">กรุณารอสักครู่ ระบบกำลังประมวลผล</p>
          </div>
        </div>
      )}

      {/* สรุปผลหลังบันทึก — หายแล้วเด้งสรุป */}
      {resultPopup && !busyId && (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-black/15 backdrop-blur-[1px] p-4" onClick={() => setResultPopup(null)}>
          <div
            className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl px-6 py-5 flex flex-col items-center gap-2 border ${resultPopup.type === 'success' ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}
            onClick={e => e.stopPropagation()}
          >
            <span className={`material-symbols-outlined text-3xl ${resultPopup.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{resultPopup.type === 'success' ? 'check_circle' : 'error'}</span>
            <p className={`text-sm font-bold text-center ${resultPopup.type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{resultPopup.text}</p>
            <button onClick={() => setResultPopup(null)} className="mt-1 px-4 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">ปิด</button>
          </div>
        </div>
      )}

      {/* หน้าต่างตรวจสอบก่อนอนุมัติ — แทน ConfirmPopup เดิม */}
      {verifyItem && (() => {
        const v = verifyItem;
        const vIsAlert = v.Alert_Flag === 'TRUE' || v.Alert_Flag === true;
        const vDateMatch = v.Date_Match === 'TRUE' || v.Date_Match === true ? true : v.Date_Match === 'FALSE' || v.Date_Match === false ? false : null;
        const vConfidence = v.AI_Confidence != null && v.AI_Confidence !== '' ? Number(v.AI_Confidence) : null;
        const vAiSteps = v.AI_Steps != null && v.AI_Steps !== '' ? Number(v.AI_Steps) : null;
        const vBusy = busyId === v.Record_ID;
        return (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setVerifyItem(null)}>
            <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl text-white flex items-center justify-center ${verifyMode==='reject' ? 'bg-red-600' : 'bg-emerald-600'}`}>
                    <span className="material-symbols-outlined">{verifyMode==='reject' ? 'block' : 'verified'}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{verifyMode==='reject' ? 'ตรวจสอบก่อนไม่อนุมัติ' : 'ตรวจสอบก่อนอนุมัติ'}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{verifyMode==='reject' ? 'โปรดระบุเหตุผลที่ไม่อนุมัติ (จำเป็นต้องตอบ) — เหตุผลจะแสดงที่ประวัติของผู้ใช้' : 'โปรดตรวจภาพหลักฐานและความถูกต้องก่อนยืนยัน — กดยืนยันเพื่ออนุมัติ'}</p>
                  </div>
                </div>
                <button onClick={() => setVerifyItem(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="px-5 pt-3 flex gap-2">
                <button onClick={()=> setVerifyMode('approve')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${verifyMode==='approve' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                  <span className="material-symbols-outlined align-middle mr-1 text-base">check_circle</span>อนุมัติ
                </button>
                <button onClick={()=> setVerifyMode('reject')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${verifyMode==='reject' ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                  <span className="material-symbols-outlined align-middle mr-1 text-base">cancel</span>ไม่อนุมัติ
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
                  <UserAvatar item={v} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 dark:text-white truncate">{v.userName} {v.userNickname && <span className="text-xs text-gray-500">({v.userNickname})</span>}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{v.userDept || 'ไม่ระบุฝ่าย'} · {toThaiDateShort(v.Date_Thai)} · {Number(v.Steps_Count).toLocaleString()} ก้าว</p>
                  </div>
                  {vIsAlert && <AlertBadge />}
                </div>

                {v.Image_Drive_ID ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <ProofImage fileId={v.Image_Drive_ID} alt={`หลักฐาน ${v.userName}`} onClick={src => window.open(src, '_blank')} />
                    <button onClick={() => window.open(driveViewUrl(v.Image_Drive_ID!), '_blank')}
                      className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">open_in_new</span>เปิดใน Drive
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">ไม่มีรูปภาพหลักฐาน</div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-3">
                    <p className="text-xs text-gray-400">AI อ่านได้</p>
                    <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{vAiSteps != null ? vAiSteps.toLocaleString() : '—'} <span className="text-xs font-normal text-gray-400">ก้าว</span></p>
                    <p className="text-[11px] text-gray-400">มั่นใจ {vConfidence != null ? Math.round(vConfidence*100) : '—'}% · วันที่ {vDateMatch===true ? 'ตรง' : vDateMatch===false ? 'ไม่ตรง' : 'ไม่ชัด'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                    <p className="text-xs text-gray-400">จำนวนก้าวที่ส่ง</p>
                    <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{Number(v.Steps_Count).toLocaleString()} <span className="text-xs font-normal text-gray-400">ก้าว</span></p>
                  </div>
                </div>
                {vIsAlert && v.Alert_Reason && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                    <span className="font-bold">แจ้งเตือน: </span>{v.Alert_Reason}
                  </div>
                )}

                {/* แก้ไขก้าว — ใช้ได้ทั้งอนุมัติ/ไม่อนุมัติ */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20 p-3">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">edit_note</span>แก้ไขจำนวนก้าว (ถ้าต้องการ) — เว้นว่างเพื่อใช้ค่าต้นฉบับ
                  </p>
                  <input type="number" min="0" value={verifyEditedSteps} onChange={e => setVerifyEditedSteps(e.target.value)}
                    placeholder={`เดิม ${Number(v.Steps_Count).toLocaleString()} ก้าว`}
                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-bold text-center outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 p-3">
                  <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">feedback</span>เหตุผลที่ไม่อนุมัติ <span className="text-red-500">*</span> <span className="font-normal text-gray-400">(จำเป็นเมื่อกด ไม่อนุมัติ — จะแสดงที่ประวัติของผู้ใช้และกลุ่มฝ่าย)</span>
                  </p>
                  <textarea value={verifyRejectReason} onChange={e=> { setVerifyRejectReason(e.target.value); if(e.target.value.trim()) setVerifyMode('reject'); }} rows={3}
                    onFocus={()=> setVerifyMode('reject')}
                    placeholder="เช่น ภาพไม่ชัดเจน / วันที่ในภาพไม่ตรงกับวันที่บันทึก / จำนวนก้าวไม่สมเหตุสมผล"
                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-red-500" />
                  <p className="text-[11px] text-gray-400 mt-1">กรอกเหตุผลแล้วกด <b>ไม่อนุมัติ</b> ด้านล่าง — ปุ่มอนุมัติจะไม่ต้องใช้เหตุผล</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setVerifyItem(null)} disabled={vBusy}
                    className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm">
                    ยกเลิก
                  </button>
                  <button onClick={() => handleVerifyApprove('reject')} disabled={vBusy || !verifyRejectReason.trim()}
                    title={!verifyRejectReason.trim() ? 'กรุณากรอกเหตุผลก่อนไม่อนุมัติ' : 'ไม่อนุมัติ — เหตุผลจะแสดงที่ประวัติ'}
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {vBusy ? <><span className="loading loading-spinner loading-xs"></span>กำลังบันทึก...</> : <><span className="material-symbols-outlined text-lg">cancel</span>ไม่อนุมัติ</>}
                  </button>
                  <button onClick={() => handleVerifyApprove('approve')} disabled={vBusy}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {vBusy ? <><span className="loading loading-spinner loading-xs"></span>กำลังบันทึก...</> : <><span className="material-symbols-outlined text-lg">check_circle</span>อนุมัติ</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
