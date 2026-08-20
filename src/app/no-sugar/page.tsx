'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlassCard from '@/components/ui/GlassCard';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import Modal from '@/components/ui/Modal';
import { getCurrentWednesdayDate, getThaiNow, toDateKey, toThaiWednesdayDisplay } from '@/utils/thaiDate';
import { profileImageUrl } from '@/utils/personnel';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData } from '@/services/api';
import type { SweetFree, User } from '@/types';

function isTrue(val: boolean | string | unknown): boolean {
  if (val === true) return true;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'T';
}

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
function PersonRow({ user, status }: { user: User; status?: boolean | null }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <ProfileAvatar user={user} size="w-9 h-9" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{user.Prefix} {user.Full_Name}</p>
        <p className="text-xs text-gray-500 truncate">
          {user.Nickname ? `ชื่อเล่น ${user.Nickname}` : ''}{user.Position ? `${user.Nickname ? ' · ' : ''}${user.Position}` : ''}
        </p>
      </div>
      {status !== null && status !== undefined && (
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
          status
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {status ? '😎 ถือศีล' : '🫠 หลุดศีล'}
        </span>
      )}
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
  const [selections, setSelections] = useState<Record<string, boolean | null>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [holidayDates] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState<'kept' | 'failed' | 'pending' | null>(null);
  const [historyDetail, setHistoryDetail] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const currentWedStr = getCurrentWednesdayDate();
  const isWedHoliday = holidayDates.includes(currentWedStr);
  const windowState = getWindowState();

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

  const setSel = (uid: string, val: boolean | null) => {
    setSelections(prev => ({ ...prev, [uid]: val }));
  };

  const userOf = (uid: string): User | undefined => users.find(x => x.User_ID === uid);

  // ค้นหาผู้ใช้จาก ID หรือชื่อที่เก็บใน Logged_By (กันกรณีที่เก็บเป็นชื่อ-สกุล)
  const resolveUser = (ref: string): User | undefined =>
    users.find(u => String(u.User_ID) === String(ref).trim()) ||
    users.find(u => u.Full_Name === String(ref).trim()) ||
    users.find(u => `${u.Prefix} ${u.Full_Name}` === String(ref).trim());

  const deptUsers = user ? users.filter(u => String(u.Department) === String(user.Department)) : [];

  // บันทึกของสัปดาห์ปัจจุบัน
  const weekRecords = sweetData.filter(s => toDateKey(s.Wednesday_Date) === currentWedStr && deptUsers.some(u => u.User_ID === s.User_ID));
  const keptRecords = weekRecords.filter(s => isTrue(s.Status));
  const failedRecords = weekRecords.filter(s => !isTrue(s.Status));
  const keptCount = keptRecords.length;
  const failedCount = failedRecords.length;
  const pendingUsers = deptUsers.filter(u => !weekRecords.some(s => s.User_ID === u.User_ID));
  const pendingCount = pendingUsers.length;

  const detailTitle = detailStatus === 'kept' ? 'รายชื่อผู้ถือศีล (งดน้ำหวาน)' : detailStatus === 'failed' ? 'รายชื่อผู้หลุดศีล (เติมน้ำหวาน)' : 'รายชื่อผู้ยังไม่บันทึก';
  const detailUsers = detailStatus === 'kept'
    ? keptRecords.map(s => userOf(s.User_ID)).filter((u): u is User => !!u)
    : detailStatus === 'failed'
      ? failedRecords.map(s => userOf(s.User_ID)).filter((u): u is User => !!u)
      : pendingUsers;

  // ประวัติการบันทึก = สรุปแยกตามสัปดาห์
  const deptRecords = sweetData.filter(s => deptUsers.some(u => u.User_ID === s.User_ID));
  const historyDates = [...new Set(deptRecords.map(s => toDateKey(s.Wednesday_Date)).filter(Boolean))].sort((a, b) => (a < b ? 1 : -1));
  // แสดงประวัติครั้งละ 3 รายการต่อหน้า พร้อมปุ่มสลับหน้า
  const HISTORY_PAGE_SIZE = 3;
  const historyTotalPages = Math.max(1, Math.ceil(historyDates.length / HISTORY_PAGE_SIZE));
  const historyPageSafe = Math.min(historyPage, historyTotalPages - 1);
  const pageDates = historyDates.slice(historyPageSafe * HISTORY_PAGE_SIZE, historyPageSafe * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);
  const histRecs = historyDetail ? deptRecords.filter(s => toDateKey(s.Wednesday_Date) === historyDetail) : [];
  const histKept = histRecs.filter(s => isTrue(s.Status));
  const histFailed = histRecs.filter(s => !isTrue(s.Status));
  const histRecorderIds = [...new Set(histRecs.map(s => String(s.Logged_By)))];
  const histRecorders = histRecorderIds
    .map(uid => ({ id: uid, user: resolveUser(uid) }))
    .filter((r): r is { id: string; user: User | undefined } => !!r.id);
  const weekSummary = (d: string): { kept: number; failed: number } => {
    const recs = deptRecords.filter(s => toDateKey(s.Wednesday_Date) === d);
    return { kept: recs.filter(s => isTrue(s.Status)).length, failed: recs.filter(s => !isTrue(s.Status)).length };
  };

  const requestSaveAll = () => {
    if (!user) return;
    if (!windowState.open) {
      setNotice({ type: 'error', text: windowState.message });
      return;
    }
    const pending = deptUsers.filter(u => selections[u.User_ID] !== null && selections[u.User_ID] !== undefined);
    if (!pending.length) {
      setNotice({ type: 'error', text: 'ยังไม่มีบุคลากรที่เลือกสถานะ — กรุณาเลือก "ถือศีล" หรือ "หลุดศีล" ก่อนบันทึก' });
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
    const pending = deptUsers.filter(u => selections[u.User_ID] !== null && selections[u.User_ID] !== undefined);
    const savedPayloads: SweetFree[] = [];
    let ok = 0;
    for (const u of pending) {
      const statusVal = selections[u.User_ID];
      const res = await postData('add-sweet-free', {
        User_ID: u.User_ID,
        Status: statusVal,
        Wednesday_Date: currentWedStr,
        Logged_By: user.User_ID,
      });
      if (res?.success) {
        ok++;
        savedPayloads.push({
          Entry_ID: `SW-new-${u.User_ID}`,
          User_ID: u.User_ID,
          Wednesday_Date: currentWedStr,
          Status: !!statusVal,
          Logged_By: user.User_ID,
        });
      }
    }
    setConfirmLoading(false);
    setSaving(false);
    setSelections({});
    if (ok > 0) {
      setSaved(true);
      // อัปเดตข้อมูลในหน้าให้แสดงผลทันที (ไม่ต้องรอ response รอบอ่านคืน)
      setSweetData(prev => {
        const updated = prev.filter(s =>
          !savedPayloads.some(np => String(np.User_ID) === String(s.User_ID) && toDateKey(np.Wednesday_Date) === toDateKey(s.Wednesday_Date))
        );
        return [...updated, ...savedPayloads];
      });
    } else {
      setNotice({ type: 'error', text: 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shadow">
            <span className="material-symbols-outlined">event_busy</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">บันทึกผลวันพุธนี้</h3>
            <p className="text-sm text-gray-500">{toThaiWednesdayDisplay(currentWedStr)}</p>
          </div>
        </div>

        <div className={`mb-4 text-sm rounded-xl p-2.5 border ${windowState.open ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
          <span className="material-symbols-outlined align-middle mr-1 text-base">{windowState.open ? 'schedule' : 'event_busy'}</span>
          {windowState.open ? '🟢 เปิดบันทึกผล' : '🔴 ปิดบันทึกผล'} — {windowState.message}
        </div>

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
                const recorded = sweetData.find(s => s.User_ID === u.User_ID && toDateKey(s.Wednesday_Date) === currentWedStr);
                const hasChoice = selections[u.User_ID] !== undefined && selections[u.User_ID] !== null;
                const sel = hasChoice ? selections[u.User_ID] : (recorded ? isTrue(recorded.Status) : null);
                return (
                  <div key={u.User_ID} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
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
                      <div className="flex items-center gap-2 shrink-0">
                        {recorded && (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            isTrue(recorded.Status)
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          }`}>
                            {isTrue(recorded.Status) ? '😎 ถือศีล' : '🫠 หลุดศีล'}
                          </span>
                        )}
                        <button onClick={() => setSel(u.User_ID, true)}
                          className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                            sel === true
                              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-emerald-400'
                          }`}>
                          😎 ถือศีล
                        </button>
                        <button onClick={() => setSel(u.User_ID, false)}
                          className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                            sel === false
                              ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-red-400'
                          }`}>
                          🫠 หลุดศีล
                        </button>
                      </div>
                    </div>
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
              <button onClick={requestSaveAll} disabled={saving || !windowState.open}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <><span className="loading loading-spinner loading-sm"></span> กำลังบันทึก...</> : windowState.open ? 'บันทึกผลทั้งหมด' : 'ยังไม่ถึงช่วงเวลาบันทึกผล'}
              </button>
              <p className="text-center text-xs text-gray-400 mt-2">บันทึกผลให้เฉพาะบุคลากรที่เลือกสถานะไว้แล้ว · หากบันทึกซ้ำจะเป็นการแก้ไขผลเดิม (แก้ไขได้ถึงศุกร์ 23:59 น.)</p>
            </div>
          </>
        )}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">ตารางสรุปยอดพุธนี้ไม่มีเชื่อม</h3>
            <p className="text-sm text-gray-500 mt-0.5">{toThaiWednesdayDisplay(currentWedStr)}</p>
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
          <p className="text-sm text-gray-500 mt-0.5">สรุปภาพรวมแยกตามสัปดาห์ — กด “รายละเอียด” เพื่อดูรายชื่อ ผู้ถือศีล / หลุดศีล และผู้ทำการบันทึก</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-medium">วันพุธ</th><th className="px-6 py-4 font-medium">ถือศีล</th><th className="px-6 py-4 font-medium">หลุดศีล</th><th className="px-6 py-4 font-medium text-right">รายละเอียด</th>
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
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">ยังไม่มีประวัติการบันทึก</td></tr>
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
        message={`คุณกำลังจะบันทึกผลงดน้ำตาลของบุคลากร ${deptUsers.filter(u => selections[u.User_ID] !== null && selections[u.User_ID] !== undefined).length} คน ในสัปดาห์นี้ (${toThaiWednesdayDisplay(currentWedStr)}) แน่ใจหรือไม่?`}
        loading={confirmLoading}
        onConfirm={saveAll}
        onClose={() => { if (!confirmLoading) setShowConfirm(false); }}
      />

      <Modal open={detailStatus !== null} onClose={() => setDetailStatus(null)} wide>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{detailTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{toThaiWednesdayDisplay(currentWedStr)} · รวม {detailUsers.length} คน</p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {detailUsers.map(u => {
            const rec = weekRecords.find(s => s.User_ID === u.User_ID);
            return <PersonRow key={u.User_ID} user={u} status={rec ? isTrue(rec.Status) : null} />;
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