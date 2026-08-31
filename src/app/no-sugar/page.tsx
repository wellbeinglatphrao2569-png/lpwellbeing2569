'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlassCard from '@/components/ui/GlassCard';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import Modal from '@/components/ui/Modal';
import { getCurrentWednesdayDate, getThaiNow, toDateKey, toThaiWednesdayDisplay, parseThaiDate } from '@/utils/thaiDate';
import { profileImageUrl } from '@/utils/personnel';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData } from '@/services/api';
import type { SweetFree, User } from '@/types';
import { useProjectWindow } from '@/hooks/useProjectWindow';

function isTrue(val: boolean | string | unknown): boolean {
  if (val === true) return true;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'T';
}
function isOtherStatus(val: unknown, reason?: unknown): boolean {
  const s = String(val || '').trim().toUpperCase();
  if (s === 'OTHER' || s === 'อื่นๆ') return true;
  if (String(reason || '').trim() !== '') return true;
  // ถ้า Status เป็น OTHER:xxx ก็ถือว่า Other
  if (String(val || '').trim().toUpperCase().startsWith('OTHER')) return true;
  return false;
}
function isOtherRecord(s: SweetFree): boolean {
  return isOtherStatus((s as any).Status, (s as any).Reason);
}
function isKeptRecord(s: SweetFree): boolean {
  return isTrue((s as any).Status) && !isOtherRecord(s);
}
function isFailedRecord(s: SweetFree): boolean {
  return !isTrue((s as any).Status) && !isOtherRecord(s);
}
const OTHER_REASONS = ['ลาป่วย','ลากิจ','ลาพักผ่อน','อบรมนอกสถานที่'] as const;

// ช่วงเวลาที่บันทึกผลได้: พุธ 14:00 น. – ศุกร์ 23:59 น. (ตามเวลาประเทศไทย UTC+7)
function getWindowState(): { open: boolean; message: string } {
  const thai = getThaiNow();
  const day = thai.getUTCDay(); // 0=อาทิตย์ .. 6=เสาร์
  const minutes = thai.getUTCHours() * 60 + thai.getUTCMinutes();
  const open = (day === 3 && minutes >= 14 * 60) || day === 4 || day === 5;
  if (open) {
    return { open: true, message: 'ช่วงเวลาบันทึกผล: พุธ 14:00 น. – ศุกร์ 23:59 น.' };
  }
  if (day === 3) {
    return { open: false, message: 'เปิดให้บันทึกผลได้ตั้งแต่พุธ 14:00 น. (วันพุธก่อนเวลา 14:00 น. ไม่เปิด)' };
  }
  // เสาร์ – อังคาร ปิด
  return { open: false, message: 'หมดเวลาบันทึกผลของสัปดาห์นี้แล้ว — เปิดบันทึกได้ตั้งแต่พุธ 14:00 น. ถึงศุกร์ 23:59 น.' };
}

// ใช้ Personnel_ID เป็น fallback เมื่อ User_ID ยังว่าง (บุคลากรที่รอลงทะเบียน)
// แก้บั๊ก: ก่อนหน้านี้ selections/key ใช้ User_ID='' ทำให้กดคนเดียวติดทั้งฝ่าย
function effectiveId(u: User): string {
  const uid = String(u.User_ID || '').trim();
  if (uid) return uid;
  return String((u as any).Personnel_ID || '').trim();
}
function sweetMatchesUser(s: SweetFree, u: User): boolean {
  const sid = String((s as any).User_ID || '').trim();
  const uid = String(u.User_ID || '').trim();
  const pid = String((u as any).Personnel_ID || '').trim();
  return Boolean((uid && sid === uid) || (pid && sid === pid));
}

// รูปโปรไฟล์ (ถ้ามี) หรือ avatar สีพร้อมอักษรตัวแรกของชื่อ
function ProfileAvatar({ user, size = 'w-10 h-10', ring = false }: { user?: User | null; size?: string; ring?: boolean }) {
  const img = user?.Profile_Image ? profileImageUrl(user.Profile_Image) : null;
  const ringCls = ring ? 'ring-2 ring-emerald-200 dark:ring-emerald-800' : '';
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="รูปโปรไฟล์" className={`${size} rounded-full object-cover shrink-0 bg-white dark:bg-gray-700 ${ringCls}`} />;
  }
  return (
    <div className={`${size} rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-emerald-400 to-emerald-600 ${ringCls}`}>
      {user?.Full_Name?.charAt(0) || user?.First_Name?.charAt(0) || '?'}
    </div>
  );
}

// แถวแสดงบุคคล: โปรไฟล์ + ชื่อ-สกุล + ชื่อเล่น + ตำแหน่ง (+ badge สถานะ ถ้ามี)
function PersonRow({ user, status, reason }: { user: User; status?: boolean | string | null; reason?: string }) {
  const isOther = typeof status === 'string' && (String(status).toUpperCase().startsWith('OTHER') || !!reason);
  const displayOther = isOther ? (reason || String(status).replace(/^OTHER:?/i,'' ) || 'อื่นๆ') : '';
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <ProfileAvatar user={user} size="w-9 h-9" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{user.Prefix} {user.Full_Name}</p>
        <p className="text-xs text-gray-500 truncate">
          {user.Nickname ? `ชื่อเล่น ${user.Nickname}` : ''}{user.Position ? `${user.Nickname ? ' · ' : ''}${user.Position}` : ''}
        </p>
      </div>
      {isOther ? (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
          📝 อื่นๆ: {displayOther}
        </span>
      ) : status !== null && status !== undefined ? (
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
          status === true || String(status).toUpperCase()==='TRUE'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {status === true || String(status).toUpperCase()==='TRUE' ? '😎 ถือศีล' : '🫠 หลุดศีล'}
        </span>
      ) : null}
    </div>
  );
}

function StatusBadge({ count, kind }: { count: number; kind: 'kept' | 'failed' }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded-full font-bold text-sm ${
      kind === 'kept'
        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
    }`}>{count}</span>
  );
}

export default function NoSugarPage() {
  const { user, isAdmin, isCommittee } = useAuth();
  const canAccess = isAdmin || isCommittee;
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [sweetData, setSweetData] = useState<SweetFree[]>([]);
  const [selections, setSelections] = useState<Record<string, boolean | string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [holidayDates] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState<'kept' | 'failed' | 'other' | 'pending' | null>(null);
  const [historyDetail, setHistoryDetail] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const currentWedStr = getCurrentWednesdayDate();
  const isWedHoliday = holidayDates.includes(currentWedStr);
  const windowState = getWindowState();
  const { window: projectWindow, isInWindow } = useProjectWindow();
  // เลือกวันพุธที่จะบันทึก — ปกติเป็นสัปดาห์ปัจจุบัน แต่ย้อนหลังได้
  const [selectedWedStr, setSelectedWedStr] = useState<string>(currentWedStr);
  const isCurrentWeek = selectedWedStr === currentWedStr;
  const isPastWeek = selectedWedStr < currentWedStr;
  const isFutureWeek = selectedWedStr > currentWedStr;
  const isOutOfWindow = projectWindow ? !isInWindow(selectedWedStr) : false;
  // สร้างรายการวันพุธย้อนหลัง 8 สัปดาห์ + สัปดาห์ปัจจุบัน — ซ่อนวันนอกห้วง
  const wedOptions = (() => {
    const opts: string[] = [];
    const base = parseThaiDate(currentWedStr);
    for (let i = 0; i < 8; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() - i * 7);
      const key = toDateKey(d);
      if (projectWindow && !isInWindow(key)) continue;
      opts.push(key);
    }
    // ถ้ากรองแล้วไม่เหลือ (ห้วงสั้นมาก) ให้แสดงสัปดาห์ปัจจุบันที่อยู่ในห้วงอย่างน้อย 1 รายการ
    if (opts.length === 0 && projectWindow) {
      const fallback = projectWindow.start;
      // หาวันพุธใกล้ fallback ที่อยู่ในห้วง
      const d = parseThaiDate(fallback);
      // ขยับหาวันพุธถัดไป
      const day = d.getDay();
      const diff = (3 - day + 7) % 7;
      d.setDate(d.getDate() + diff);
      const k = toDateKey(d);
      if (isInWindow(k)) opts.push(k);
    }
    return opts;
  })();
  // เมื่อห้วงเปลี่ยนแล้ววันที่เลือกหลุดห้วง ให้รีเซ็ตไปสัปดาห์ปัจจุบันในห้วง
  useEffect(() => {
    if (!projectWindow) return;
    if (!isInWindow(selectedWedStr)) {
      // หาสัปดาห์ปัจจุบันที่อยู่ในห้วง ถ้าไม่มีให้ใช้วันแรกในห้วงที่เป็นวันพุธ
      if (isInWindow(currentWedStr)) {
        setSelectedWedStr(currentWedStr); // eslint-disable-line react-hooks/set-state-in-effect
      } else if (wedOptions.length > 0) {
        setSelectedWedStr(wedOptions[0]); // eslint-disable-line react-hooks/set-state-in-effect
      }
      setSelections({}); // eslint-disable-line react-hooks/set-state-in-effect
      setSaved(false); // eslint-disable-line react-hooks/set-state-in-effect
      setNotice(null); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [projectWindow?.start, projectWindow?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canAccess) {
      router.replace('/home');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  if (!canAccess) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlassCard className="p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-gray-400">lock</span>
            <p className="font-bold text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
            <p className="text-sm text-gray-500">เฉพาะเจ้าหน้าที่ นสส. และกรรมการประจำฝ่ายเท่านั้น กำลังกลับสู่หน้าแรก...</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  async function loadData() {
    const [us, sweet] = await Promise.all([
      fetchData<User[]>('users'),
      fetchData<SweetFree[]>('sweet-free'),
    ]);
    if (us) setUsers(us);
    if (sweet) setSweetData(sweet);
  }

  const setSel = (uid: string, val: boolean | string | null) => {
    setSelections(prev => ({ ...prev, [uid]: val }));
  };

  const userOf = (uid: string): User | undefined =>
    users.find(x => String(x.User_ID) === String(uid).trim() || String((x as any).Personnel_ID || '') === String(uid).trim());

  // ค้นหาผู้ใช้จาก ID หรือชื่อที่เก็บใน Logged_By (กันกรณีที่เก็บเป็นชื่อ-สกุล)
  const resolveUser = (ref: string): User | undefined =>
    users.find(u => String(u.User_ID) === String(ref).trim()) ||
    users.find(u => String((u as any).Personnel_ID || '') === String(ref).trim()) ||
    users.find(u => u.Full_Name === String(ref).trim()) ||
    users.find(u => `${u.Prefix} ${u.Full_Name}` === String(ref).trim());

  const deptUsers = user ? users.filter(u => String(u.Department) === String(user.Department)) : [];

  // บันทึกของสัปดาห์ที่เลือก — แยก อื่นๆ ออกจากนับถือศีล/หลุดศีล (ไม่นับคะแนน) — ใช้ effectiveId matching
  const weekRecords = sweetData.filter(s => toDateKey(s.Wednesday_Date) === selectedWedStr && deptUsers.some(u => sweetMatchesUser(s, u)));
  const keptRecords = weekRecords.filter(s => isKeptRecord(s));
  const failedRecords = weekRecords.filter(s => isFailedRecord(s));
  const otherRecords = weekRecords.filter(s => isOtherRecord(s));
  const keptCount = keptRecords.length;
  const failedCount = failedRecords.length;
  const otherCount = otherRecords.length;
  const pendingUsers = deptUsers.filter(u => !weekRecords.some(s => sweetMatchesUser(s, u)));
  const pendingCount = pendingUsers.length;

  const detailTitle = detailStatus === 'kept' ? 'รายชื่อผู้ถือศีล (งดน้ำหวาน)' : detailStatus === 'failed' ? 'รายชื่อผู้หลุดศีล (เติมน้ำหวาน)' : detailStatus === 'other' ? 'รายชื่ออื่นๆ (ไม่นับคะแนน)' : 'รายชื่อผู้ยังไม่บันทึก';
  const detailUsers = detailStatus === 'kept'
    ? keptRecords.map(s => userOf(s.User_ID)).filter((u): u is User => !!u)
    : detailStatus === 'failed'
      ? failedRecords.map(s => userOf(s.User_ID)).filter((u): u is User => !!u)
      : detailStatus === 'other'
        ? otherRecords.map(s => userOf(s.User_ID)).filter((u): u is User => !!u)
        : pendingUsers;

  // ประวัติการบันทึก = สรุปแยกตามสัปดาห์ (ใช้ effective matching)
  const deptRecords = sweetData.filter(s => deptUsers.some(u => sweetMatchesUser(s, u)));
  const historyDates = [...new Set(deptRecords.map(s => toDateKey(s.Wednesday_Date)).filter(Boolean))].sort((a, b) => (a < b ? 1 : -1));
  // แสดงประวัติครั้งละ 3 รายการต่อหน้า พร้อมปุ่มสลับหน้า
  const HISTORY_PAGE_SIZE = 3;
  const historyTotalPages = Math.max(1, Math.ceil(historyDates.length / HISTORY_PAGE_SIZE));
  const historyPageSafe = Math.min(historyPage, historyTotalPages - 1);
  const pageDates = historyDates.slice(historyPageSafe * HISTORY_PAGE_SIZE, historyPageSafe * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);
  const histRecs = historyDetail ? deptRecords.filter(s => toDateKey(s.Wednesday_Date) === historyDetail) : [];
  const histKept = histRecs.filter(s => isKeptRecord(s));
  const histFailed = histRecs.filter(s => isFailedRecord(s));
  const histOther = histRecs.filter(s => isOtherRecord(s));
  const histRecorderIds = [...new Set(histRecs.map(s => String(s.Logged_By)))];
  const histRecorders = histRecorderIds
    .map(uid => ({ id: uid, user: resolveUser(uid) }))
    .filter((r): r is { id: string; user: User | undefined } => !!r.id);
  const weekSummary = (d: string): { kept: number; failed: number; other: number } => {
    const recs = deptRecords.filter(s => toDateKey(s.Wednesday_Date) === d);
    return { kept: recs.filter(s => isKeptRecord(s)).length, failed: recs.filter(s => isFailedRecord(s)).length, other: recs.filter(s => isOtherRecord(s)).length };
  };

  // ตรวจว่าสัปดาห์ที่เลือกสามารถบันทึก/แก้ไขได้หรือไม่ (ต่อคน)
  const canEditFor = (u: User, recorded?: SweetFree | null) => {
    if (projectWindow && !isInWindow(selectedWedStr)) return false;
    if (isFutureWeek) return false;
    if (isCurrentWeek && windowState.open) return true; // ในช่วง พ.14:00-ศ.23:59 แก้ได้ตลอด
    // นอกช่วง หรือสัปดาห์ย้อนหลัง: ถ้ามีบันทึกแล้ว ห้ามแก้ (บันทึกได้ครั้งเดียวแล้วล็อก)
    if (recorded) return false;
    return true; // ยังไม่เคยบันทึก -> ให้บันทึกย้อนหลังได้ครั้งเดียว
  };

  const requestSaveAll = () => {
    if (!user) return;
    if (isOutOfWindow && projectWindow) {
      setNotice({ type: 'error', text: `วันพุธที่เลือกอยู่นอกห้วงเวลาที่ตั้งค่าไว้ (${projectWindow.start} ถึง ${projectWindow.end}) — กรุณาเลือกวันพุธในห้วง` });
      return;
    }
    if (isFutureWeek) {
      setNotice({ type: 'error', text: 'ไม่สามารถบันทึกสำหรับสัปดาห์ในอนาคตได้' });
      return;
    }
    // นอกช่วงปกติ จะอนุญาตเฉพาะการบันทึกย้อนหลังครั้งเดียว (ถ้ามีบันทึกแล้วจะถูกกรองออก)
    const pending = deptUsers.filter(u => {
      const eid = effectiveId(u);
      const v = selections[eid];
      if (v === null || v === undefined) return false;
      const rec = sweetData.find(s => toDateKey(s.Wednesday_Date) === selectedWedStr && sweetMatchesUser(s, u));
      return canEditFor(u, rec || null);
    });
    if (!pending.length) {
      if (isCurrentWeek && !windowState.open) {
        setNotice({ type: 'error', text: 'นอกช่วงเวลาบันทึกปกติ — สัปดาห์นี้สามารถบันทึกย้อนหลังได้เฉพาะคนที่ยังไม่เคยบันทึกเท่านั้น (บันทึกแล้วจะแก้ไขไม่ได้)' });
        return;
      }
      if (isPastWeek) {
        setNotice({ type: 'error', text: 'สัปดาห์ย้อนหลังนี้ไม่มีคนที่ยังไม่เคยบันทึกแล้ว — บันทึกย้อนหลังได้เพียงครั้งเดียวต่อคน (แก้ไขไม่ได้)' });
        return;
      }
      setNotice({ type: 'error', text: 'ยังไม่มีบุคลากรที่เลือกสถานะ — กรุณาเลือก "ถือศีล" / "หลุดศีล" / "อื่นๆ" ก่อนบันทึก' });
      return;
    }
    // ตรวจว่าที่เลือก อื่นๆ มีเหตุผลครบ
    const missingReason = pending.find(u => {
      const v = selections[effectiveId(u)];
      return typeof v === 'string' && String(v).toUpperCase().startsWith('OTHER') && !String(v).split(':')[1];
    });
    if (missingReason) {
      setNotice({ type: 'error', text: 'กรุณาเลือกเหตุผลสำหรับสถานะ "อื่นๆ" ให้ครบทุกคน (ลาป่วย/ลากิจ/ลาพักผ่อน/อบรมนอกสถานที่)' });
      return;
    }
    setNotice(null);
    setShowConfirm(true);
  };

  const saveAll = async () => {
    if (!user) return;
    setShowConfirm(false);
    setConfirmLoading(true);
    setSaving(true);
    setSaved(false);
    const pending = deptUsers.filter(u => {
      const eid = effectiveId(u);
      const v = selections[eid];
      if (v === null || v === undefined) return false;
      const rec = sweetData.find(s => toDateKey(s.Wednesday_Date) === selectedWedStr && sweetMatchesUser(s, u));
      return canEditFor(u, rec || null);
    });
    const savedPayloads: SweetFree[] = [];
    let ok = 0;
    let lastError: string | null = null;
    for (const u of pending) {
      const eid = effectiveId(u);
      const selVal: any = selections[eid];
      const isOtherSel = typeof selVal === 'string' && String(selVal).toUpperCase().startsWith('OTHER');
      const statusToSend: any = isOtherSel ? 'OTHER' : !!selVal;
      const reasonToSend = isOtherSel ? String(selVal).split(':').slice(1).join(':') : '';
      const res = await postData('add-sweet-free', {
        User_ID: eid,
        Personnel_ID: (u as any).Personnel_ID || '',
        Status: statusToSend,
        Reason: reasonToSend,
        Wednesday_Date: selectedWedStr,
        Logged_By: user.User_ID,
      });
      if (res?.success) {
        ok++;
        savedPayloads.push({
          Entry_ID: `SW-new-${eid}`,
          User_ID: eid,
          Wednesday_Date: selectedWedStr,
          Status: isOtherSel ? 'OTHER' : !!selVal,
          Reason: reasonToSend,
          Logged_By: user.User_ID,
        } as SweetFree);
      } else if (res?.message) {
        lastError = String(res.message);
      }
    }
    setConfirmLoading(false);
    setSaving(false);
    // ล้างเฉพาะคนที่บันทึกสำเร็จ
    if (ok > 0) {
      setSelections(prev => {
        const next = { ...prev };
        pending.slice(0, ok).forEach(u => { delete next[effectiveId(u)]; });
        return next;
      });
    }
    if (ok > 0) {
      setSaved(true);
      // อัปเดตข้อมูลในหน้าให้แสดงผลทันที (ไม่ต้องรอ response รอบอ่านคืน) — ต้อง match ทั้ง User_ID และ Personnel_ID
      setSweetData(prev => {
        const updated = prev.filter(s =>
          !savedPayloads.some(np => toDateKey(np.Wednesday_Date) === toDateKey(s.Wednesday_Date) && (String(np.User_ID) === String((s as any).User_ID)))
        );
        return [...updated, ...savedPayloads];
      });
      if (ok < pending.length && lastError) {
        setNotice({ type: 'error', text: lastError });
      }
    } else {
      setNotice({ type: 'error', text: lastError || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    }
    loadData();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">พุธนี้ไม่มีเชื่อม</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">No Sugar Wednesday — บันทึกผลงดน้ำตาลของบุคลากรในฝ่าย (เจ้าหน้าที่ นสส. และกรรมการประจำฝ่าย)</p>
      </div>

      {notice && (
        <div className={`p-3 rounded-xl text-sm font-medium ${notice.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'}`}>
          {notice.text}
        </div>
      )}

      <GlassCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shadow">
              <span className="material-symbols-outlined">event_busy</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">บันทึกผลวันพุธนี้</h3>
              <p className="text-sm text-gray-500">{toThaiWednesdayDisplay(selectedWedStr)}</p>
            </div>
          </div>
          <select value={selectedWedStr} onChange={e => { setSelectedWedStr(e.target.value); setSelections({}); setSaved(false); setNotice(null); }}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium">
            {wedOptions.map(d => (
              <option key={d} value={d}>{toThaiWednesdayDisplay(d)}{d===currentWedStr ? ' (สัปดาห์ปัจจุบัน)' : ''}</option>
            ))}
          </select>
        </div>

        {isOutOfWindow && projectWindow && (
          <div className="mb-4 text-sm rounded-xl p-2.5 border bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
            ⛔ วันพุธที่เลือกอยู่นอกห้วงเวลาที่ตั้งค่าไว้ ({projectWindow.start} ถึง {projectWindow.end}) — กรุณาเลือกวันพุธในห้วงเท่านั้น (ตั้งค่าได้ที่ Admin → ตั้งค่าห้วงเวลา)
          </div>
        )}
        {!isCurrentWeek && !isOutOfWindow && (
          <div className={`mb-4 text-sm rounded-xl p-2.5 border ${isFutureWeek ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200' : isPastWeek ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200' : 'bg-gray-50'}`}>
            {isFutureWeek ? '⛔ ไม่สามารถบันทึกสำหรับสัปดาห์ในอนาคตได้' : `ℹ️ กำลังดูสัปดาห์ย้อนหลัง ${toThaiWednesdayDisplay(selectedWedStr)} — บันทึกย้อนหลังได้เพียงครั้งเดียวต่อคน (บันทึกแล้วจะแก้ไขไม่ได้)`}
          </div>
        )}
        {isCurrentWeek && (
          <div className={`mb-4 text-sm rounded-xl p-2.5 border ${windowState.open ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
            <span className="material-symbols-outlined align-middle mr-1 text-base">{windowState.open ? 'schedule' : 'event_busy'}</span>
            {windowState.open ? '🟢 เปิดบันทึกผล' : '🔴 ปิดบันทึกผล'} — {windowState.message}
            {!windowState.open && <span className="ml-2 text-xs">· สัปดาห์นี้อยู่นอกช่วงเวลา แต่อนุญาตให้บันทึกย้อนหลังได้ครั้งเดียวสำหรับคนที่ยังไม่เคยบันทึก (บันทึกแล้วล็อก)</span>}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium">
            <span className="material-symbols-outlined text-base">group</span> ฝ่าย {user?.Department}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">
            บุคลากร {deptUsers.length} คน
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium">
            รอบันทึก {pendingCount} คน
          </span>
        </div>

        {isWedHoliday ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <span className="material-symbols-outlined text-3xl mr-2">celebration</span>
            <span>วันหยุด</span>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {deptUsers.map(u => {
                const eid = effectiveId(u);
                const recorded = sweetData.find(s => sweetMatchesUser(s, u) && toDateKey(s.Wednesday_Date) === selectedWedStr);
                const locked = !canEditFor(u, recorded || null) && !!recorded;
                const hasChoice = selections[eid] !== undefined && selections[eid] !== null;
                let sel: any = hasChoice ? selections[eid] : null;
                if (!hasChoice && recorded) {
                  if (isOtherRecord(recorded)) sel = `OTHER:${String((recorded as any).Reason || '').trim()}`;
                  else sel = isTrue(recorded.Status);
                }
                const selIsOther = typeof sel === 'string' && String(sel).toUpperCase().startsWith('OTHER');
                const selOtherReason = selIsOther ? String(sel).split(':').slice(1).join(':') : '';
                const recordedIsOther = recorded ? isOtherRecord(recorded) : false;
                const recordedReason = recordedIsOther ? String((recorded as any).Reason || '').trim() : '';
                return (
                  <div key={eid} className={`rounded-2xl border p-4 ${locked ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProfileAvatar user={u} ring />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">{u.Prefix} {u.Full_Name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {u.Nickname ? `ชื่อเล่น ${u.Nickname}` : ''}{u.Position ? `${u.Nickname ? ' · ' : ''}${u.Position}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {recorded && (
                          isOtherRecord(recorded) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                              📝 อื่นๆ: {recordedReason || 'ไม่ระบุ'}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              isTrue(recorded.Status)
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                            }`}>
                              {isTrue(recorded.Status) ? '😎 ถือศีล' : '🫠 หลุดศีล'}
                            </span>
                          )
                        )}
                        <button disabled={locked} onClick={() => setSel(eid, true)}
                          className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            sel === true
                              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-emerald-400'
                          }`}>
                          😎 ถือศีล
                        </button>
                        <button disabled={locked} onClick={() => setSel(eid, false)}
                          className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            sel === false
                              ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-red-400'
                          }`}>
                          🫠 หลุดศีล
                        </button>
                        <button disabled={locked} onClick={() => setSel(eid, selIsOther ? null : `OTHER:${OTHER_REASONS[0]}`)}
                          className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            selIsOther
                              ? 'border-gray-400 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400'
                          }`}>
                          📝 อื่นๆ
                        </button>
                        {selIsOther && (
                          <select disabled={locked} value={selOtherReason} onChange={e=> setSel(eid, `OTHER:${e.target.value}`)}
                            className="px-3 py-2 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium disabled:opacity-40">
                            {OTHER_REASONS.map(r=> <option key={r} value={r}>{r}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    {locked && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">🔒 บันทึกย้อนหลังแล้ว — แก้ไขไม่ได้ (บันทึกได้เพียงครั้งเดียว)</p>}
                    {selIsOther && !locked && <p className="text-[11px] text-gray-400 mt-2">จะบันทึกเป็น “อื่นๆ: {selOtherReason}” — <strong>ไม่นับ</strong>เป็นถือศีล/หลุดศีล เพราะไม่เห็นกับตา</p>}
                  </div>
                );
              })}
              {deptUsers.length === 0 && (
                <div className="text-center text-gray-400 py-8">ไม่พบข้อมูลบุคลากรในฝ่ายนี้</div>
              )}
            </div>

            <div className="mt-6">
              {saved && (
                <div className="mb-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm">
                  <span className="material-symbols-outlined text-lg">check_circle</span> บันทึกผลงดหวานสำเร็จ
                </div>
              )}
              <button onClick={requestSaveAll} disabled={saving || isFutureWeek || (isOutOfWindow && !!projectWindow)}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <><span className="loading loading-spinner loading-sm"></span> กำลังบันทึก...</> : isOutOfWindow && projectWindow ? 'นอกห้วงเวลา — บันทึกไม่ได้' : isFutureWeek ? 'ไม่สามารถบันทึกสัปดาห์ในอนาคตได้' : isCurrentWeek && windowState.open ? 'บันทึกผลทั้งหมด' : 'บันทึกย้อนหลัง (ครั้งเดียว · แก้ไขไม่ได้)'}
              </button>
              <p className="text-center text-xs text-gray-400 mt-2">
                {isCurrentWeek && windowState.open ? 'บันทึกผลให้เฉพาะบุคลากรที่เลือกสถานะไว้แล้ว · หากบันทึกซ้ำจะเป็นการแก้ไขผลเดิม (แก้ไขได้ถึงศุกร์ 23:59 น.)' : 'บันทึกย้อนหลังได้เพียงครั้งเดียวต่อคน · บันทึกแล้วจะล็อกไม่ให้แก้ไข'}
              </p>
            </div>
          </>
        )}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">ตารางสรุปยอดพุธนี้ไม่มีเชื่อม</h3>
            <p className="text-sm text-gray-500 mt-0.5">{toThaiWednesdayDisplay(selectedWedStr)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-medium">สถานะ</th><th className="px-6 py-4 font-medium">จำนวน</th><th className="px-6 py-4 font-medium text-right">รายละเอียด</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-base">😎</span>
                    ถือศีล (งดน้ำหวานได้)
                  </span>
                </td>
                <td className="px-6 py-4"><StatusBadge count={keptCount} kind="kept" /></td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setDetailStatus('kept')} disabled={keptCount === 0}
                    className="text-sm text-cyan-700 dark:text-cyan-400 font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline">
                    รายละเอียด
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-base">🫠</span>
                    หลุดศีล (เติมน้ำหวาน)
                  </span>
                </td>
                <td className="px-6 py-4"><StatusBadge count={failedCount} kind="failed" /></td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setDetailStatus('failed')} disabled={failedCount === 0}
                    className="text-sm text-cyan-700 dark:text-cyan-400 font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline">
                    รายละเอียด
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-base">📝</span>
                    อื่นๆ (ไม่นับคะแนน)
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 font-bold text-sm">{otherCount}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setDetailStatus('other')} disabled={otherCount === 0}
                    className="text-sm text-cyan-700 dark:text-cyan-400 font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline">
                    รายละเอียด
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-base">⏳</span>
                    ยังไม่บันทึก
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 font-bold text-sm">{pendingCount}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setDetailStatus('pending')} disabled={pendingCount === 0}
                    className="text-sm text-cyan-700 dark:text-cyan-400 font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline">
                    รายละเอียด
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">ประวัติการบันทึก</h3>
          <p className="text-sm text-gray-500 mt-0.5">สรุปภาพรวมแยกตามสัปดาห์ — กด “รายละเอียด” เพื่อดูรายชื่อ ผู้ถือศีล / หลุดศีล / อื่นๆ และผู้ทำการบันทึก</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-medium">วันพุธ</th><th className="px-6 py-4 font-medium">ถือศีล</th><th className="px-6 py-4 font-medium">หลุดศีล</th><th className="px-6 py-4 font-medium">อื่นๆ</th><th className="px-6 py-4 font-medium text-right">รายละเอียด</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pageDates.map(d => {
                const wk = weekSummary(d);
                return (
                  <tr key={d} className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{toThaiWednesdayDisplay(d)}</span>
                    </td>
                    <td className="px-6 py-4"><StatusBadge count={wk.kept} kind="kept" /></td>
                    <td className="px-6 py-4"><StatusBadge count={wk.failed} kind="failed" /></td>
                    <td className="px-6 py-4"><span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 font-bold text-sm">{wk.other}</span></td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setHistoryDetail(d)}
                        className="text-sm text-cyan-700 dark:text-cyan-400 font-medium hover:underline">
                        รายละเอียด
                      </button>
                    </td>
                  </tr>
                );
              })}
              {historyDates.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">ยังไม่มีประวัติการบันทึก</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {historyTotalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPageSafe === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
              <span className="material-symbols-outlined text-base">chevron_left</span> ก่อนหน้า
            </button>
            <span className="text-sm text-gray-500">หน้า {historyPageSafe + 1} / {historyTotalPages}</span>
            <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))} disabled={historyPageSafe >= historyTotalPages - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
              ถัดไป <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        )}
      </GlassCard>

      <ConfirmPopup
        open={showConfirm}
        title="ยืนยันการบันทึกผลงดน้ำตาล"
        message={`คุณกำลังจะบันทึกผลงดน้ำตาลของบุคลากร ${deptUsers.filter(u => { const eid=effectiveId(u); return selections[eid]!==null && selections[eid]!==undefined; }).length} คน ในสัปดาห์นี้ (${toThaiWednesdayDisplay(selectedWedStr)}) แน่ใจหรือไม่?`}
        loading={confirmLoading}
        onConfirm={saveAll}
        onClose={() => { if (!confirmLoading) setShowConfirm(false); }}
      />

      <Modal open={detailStatus !== null} onClose={() => setDetailStatus(null)} wide>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{detailTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{toThaiWednesdayDisplay(selectedWedStr)} · รวม {detailUsers.length} คน</p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {detailUsers.map(u => {
            const rec = weekRecords.find(s => sweetMatchesUser(s, u));
            const eid = effectiveId(u);
            if (!rec) return <PersonRow key={eid} user={u} status={null} />;
            if (isOtherRecord(rec)) return <PersonRow key={eid} user={u} status={`OTHER:${String((rec as any).Reason||'')}`} reason={String((rec as any).Reason||'')} />;
            return <PersonRow key={eid} user={u} status={isTrue(rec.Status)} />;
          })}
          {detailUsers.length === 0 && (
            <div className="text-center text-gray-400 py-8">ไม่มีข้อมูลในสถานะนี้</div>
          )}
        </div>
        <button onClick={() => setDetailStatus(null)} className="btn-primary w-full justify-center mt-5">ปิด</button>
      </Modal>

      <Modal open={historyDetail !== null} onClose={() => setHistoryDetail(null)} wide>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">ประวัติการบันทึก</h3>
        <p className="text-sm text-gray-500 mb-4">สรุปภาพรวม {historyDetail ? toThaiWednesdayDisplay(historyDetail) : ''} · บันทึกทั้งสิ้น {histRecs.length} คน</p>
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <p className="font-bold text-sm text-emerald-700 dark:text-emerald-400 mb-2">😎 ถือศีล (งดน้ำหวานได้) — {histKept.length} คน</p>
            <div className="space-y-2">
              {histKept.map(s => {
                const u = userOf(s.User_ID);
                return u ? <PersonRow key={s.Entry_ID || s.User_ID} user={u} status /> : null;
              })}
              {histKept.length === 0 && <p className="text-xs text-gray-400">ไม่มีผู้ถือศีลในสัปดาห์นี้</p>}
            </div>
          </div>
          <div>
            <p className="font-bold text-sm text-red-700 dark:text-red-400 mb-2">🫠 หลุดศีล (เติมน้ำหวาน) — {histFailed.length} คน</p>
            <div className="space-y-2">
              {histFailed.map(s => {
                const u = userOf(s.User_ID);
                return u ? <PersonRow key={s.Entry_ID || s.User_ID} user={u} status={false} /> : null;
              })}
              {histFailed.length === 0 && <p className="text-xs text-gray-400">ไม่มีผู้หลุดศีลในสัปดาห์นี้</p>}
            </div>
          </div>
          <div>
            <p className="font-bold text-sm text-gray-600 dark:text-gray-300 mb-2">📝 อื่นๆ (ไม่นับคะแนน) — {histOther.length} คน</p>
            <div className="space-y-2">
              {histOther.map(s => {
                const u = userOf(s.User_ID);
                return u ? <PersonRow key={s.Entry_ID || s.User_ID} user={u} status={`OTHER:${String((s as any).Reason||'')}`} reason={String((s as any).Reason||'')} /> : null;
              })}
              {histOther.length === 0 && <p className="text-xs text-gray-400">ไม่มีสถานะอื่นๆ ในสัปดาห์นี้</p>}
            </div>
          </div>
          <div>
            <p className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-2">✍️ ผู้ทำการบันทึก — {histRecorders.length} คน</p>
            <div className="space-y-2">
              {histRecorders.map(r => r.user ? <PersonRow key={r.id} user={r.user} /> : (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-gray-500 bg-gray-200 dark:bg-gray-700">บ</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{r.id}</p>
                    <p className="text-xs text-gray-400">ไม่พบข้อมูลผู้ใช้</p>
                  </div>
                </div>
              ))}
              {histRecorders.length === 0 && <p className="text-xs text-gray-400">ไม่มีข้อมูลผู้บันทึก</p>}
            </div>
          </div>
        </div>
        <button onClick={() => setHistoryDetail(null)} className="btn-primary w-full justify-center mt-5">ปิด</button>
      </Modal>
    </div>
  );
}