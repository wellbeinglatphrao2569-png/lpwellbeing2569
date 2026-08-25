'use client';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import ProofImage from '@/components/ProofImage';
import { useAuth } from '@/hooks/useAuth';
import { fetchData } from '@/services/api';
import type { StepsLog, User } from '@/types';
import { toThaiDateShort } from '@/utils/thaiDate';
import { profileImageUrl } from '@/utils/personnel';

type HistoryItem = StepsLog & { userName: string; userDept: string; userNickname: string; userProfileImage?: string };

function driveViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
}
function safeThaiDate(v: unknown): string {
  try { return toThaiDateShort(String(v ?? '')); } catch { return String(v ?? ''); }
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

export default function VerifyHistoryPage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [steps, setSteps] = useState<StepsLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitter, setSubmitter] = useState('');
  const [status, setStatus] = useState<'all' | 'Approved' | 'Rejected'>('all');
  const [reviewer, setReviewer] = useState('');
  const [selected, setSelected] = useState<HistoryItem | null>(null);

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
      .filter(s =>
        (s.Record_Method === 'ภาพถ่าย' || (s.Image_Drive_ID && s.Image_Drive_ID.trim() !== '')) &&
        s.Status !== 'Pending'
      )
      .map(s => {
        const u = userMap.get(s.User_ID);
        return {
          ...s,
          userName: u?.Full_Name || s.User_ID,
          userDept: u?.Department || '',
          userNickname: u?.Nickname || '',
          userProfileImage: profileImageUrl(u?.Profile_Image) || undefined,
        };
      })
      .sort((a, b) => String(b.Recorded_At || b.Date_Thai || '').localeCompare(String(a.Recorded_At || a.Date_Thai || '')));
  }, [steps, userMap]);

  const submitterOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const item of historyItems) {
      const key = String(item.User_ID);
      if (seen.has(key)) continue;
      seen.add(key);
      const u = userMap.get(item.User_ID);
      opts.push({ id: key, name: u?.Full_Name || String(item.User_ID) });
    }
    return opts;
  }, [historyItems, userMap]);

  const reviewerOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const item of historyItems) {
      if (!item.Auditor_ID) continue;
      const key = String(item.Auditor_ID);
      if (seen.has(key)) continue;
      seen.add(key);
      const u = userMap.get(item.Auditor_ID);
      opts.push({ id: key, name: u?.Full_Name || item.Auditor_ID });
    }
    return opts;
  }, [historyItems, userMap]);

  const filtered = useMemo(() => {
    return historyItems.filter(i =>
      (!submitter || String(i.User_ID) === submitter) &&
      (status === 'all' || i.Status === status) &&
      (!reviewer || (i.Auditor_ID && String(i.Auditor_ID) === reviewer))
    );
  }, [historyItems, submitter, status, reviewer]);

  const hasActiveFilter = !!submitter || status !== 'all' || !!reviewer;

  function clearFilters() {
    setSubmitter('');
    setStatus('all');
    setReviewer('');
  }

  const sel = selected;
  const selIsAlert = !!sel && (sel.Alert_Flag === 'TRUE' || sel.Alert_Flag === true);
  const selDateMatch = sel ? (sel.Date_Match === 'TRUE' || sel.Date_Match === true ? true : sel.Date_Match === 'FALSE' || sel.Date_Match === false ? false : null) : null;
  const selConfidence = sel && sel.AI_Confidence != null && sel.AI_Confidence !== '' ? Number(sel.AI_Confidence) : null;
  const selAiSteps = sel && sel.AI_Steps != null && sel.AI_Steps !== '' ? Number(sel.AI_Steps) : null;
  const selAuditor = sel?.Auditor_ID ? (userMap.get(String(sel.Auditor_ID)) || users.find(u=> String(u.User_ID)===String(sel.Auditor_ID) || String(u.Personnel_ID)===String(sel.Auditor_ID)) || null) : null;

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
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">รายการที่อนุมัติ / ไม่อนุมัติแล้ว เรียงจากล่าสุดไปเก่าสุด — คลิกเพื่อดูรายละเอียดและภาพหลักฐาน</p>
        </div>
        <Link href="/admin/verify-steps"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors shrink-0">
          <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
          รายการรอตรวจสอบ
        </Link>
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          ผู้บันทึก
          <select value={submitter} onChange={e => setSubmitter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">ทุกคน</option>
            {submitterOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
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
          ผู้ตรวจสอบ
          <select value={reviewer} onChange={e => setReviewer(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">ทุกคน</option>
            {reviewerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        {hasActiveFilter && (
          <button onClick={clearFilters}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-base">filter_alt_off</span>
            ล้างตัวกรอง
          </button>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">พบ {filtered.length} รายการ</span>
      </div>

      {loading ? (
        <GlassCard className="p-10 text-center text-gray-400"><span className="loading loading-spinner loading-lg text-emerald-600"></span></GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-10 text-center text-gray-400">
          <span className="material-symbols-outlined text-4xl block mb-2">history</span>
          ไม่พบรายการตามเงื่อนไขที่เลือก
        </GlassCard>
      ) : (
        <div className="relative">
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
          {filtered.map(item => {
            const isAlert = item.Alert_Flag === 'TRUE' || item.Alert_Flag === true;
            const dateMatch = item.Date_Match === 'TRUE' || item.Date_Match === true ? true : item.Date_Match === 'FALSE' || item.Date_Match === false ? false : null;
            const confidence = item.AI_Confidence != null && item.AI_Confidence !== '' ? Number(item.AI_Confidence) : null;
            const aiSteps = item.AI_Steps != null && item.AI_Steps !== '' ? Number(item.AI_Steps) : null;
            const auditor = item.Auditor_ID ? userMap.get(item.Auditor_ID) : null;
            const isApproved = item.Status === 'Approved';

            return (
              <div key={item.Record_ID} className="relative pl-9 pb-5 last:pb-0">
                <span className={`absolute left-0 top-2 w-[23px] h-[23px] rounded-full border-4 border-white dark:border-gray-800 shadow-sm flex items-center justify-center ${isApproved ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  <span className="material-symbols-outlined text-white text-[11px]">{isApproved ? 'check' : 'close'}</span>
                </span>
                <div onClick={() => setSelected(item)}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 cursor-pointer hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.userProfileImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.userProfileImage} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold shrink-0">{(item.userName || '?').charAt(0)}</div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{item.userName}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {item.userNickname ? `ชื่อเล่น: ${item.userNickname} · ` : ''}{item.userDept || 'ไม่ระบุฝ่าย'} · วันที่บันทึก {safeThaiDate(item.Date_Thai)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isAlert && <AlertBadge />}
                      <StatusBadge status={item.Status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <span>จำนวนก้าว <b className="text-emerald-600 dark:text-emerald-400">{Number(item.Steps_Count).toLocaleString()}</b></span>
                    <span>AI อ่านได้ <b className="text-purple-600 dark:text-purple-400">{aiSteps != null ? aiSteps.toLocaleString() : '—'}</b> ({confidence != null ? Math.round(confidence * 100) : '—'}%)</span>
                    <span>วันที่ในภาพ: {dateMatch === true ? <b className="text-emerald-600 dark:text-emerald-400">ตรงกัน</b> : dateMatch === false ? <b className="text-red-600 dark:text-red-400">ไม่ตรง</b> : <b className="text-amber-600 dark:text-amber-400">ไม่พบ/ไม่ชัด</b>}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    ตรวจสอบโดย <span className="font-bold">{auditor ? auditor.Full_Name : (item.Auditor_ID || '—')}</span>
                    {item.Reviewed_At && <span> · {item.Reviewed_At}</span>}
                    {item.Status === 'Rejected' && item.Reject_Reason && (
                      <span className="text-red-500"> · เหตุผล: {item.Reject_Reason}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
                  <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-lg shrink-0">{(sel.userName || '?').charAt(0)}</div>
                )}
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

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">วันที่บันทึก</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{safeThaiDate(sel.Date_Thai)}</p>
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

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                <p><span className="text-gray-400">ผลการตรวจสอบ:</span> {sel.Status === 'Approved' ? <span className="font-bold text-emerald-600 dark:text-emerald-400">อนุมัติ</span> : <span className="font-bold text-red-600 dark:text-red-400">ไม่อนุมัติ</span>}</p>
                <p className="mt-1"><span className="text-gray-400">ตรวจสอบโดย:</span> <span className="font-bold">{selAuditor ? selAuditor.Full_Name : (sel.Auditor_ID || '—')}</span></p>
                {sel.Reviewed_At && <p className="mt-1"><span className="text-gray-400">เวลาตรวจสอบ:</span> <span className="font-bold">{sel.Reviewed_At}</span></p>}
                {sel.Status === 'Rejected' && sel.Reject_Reason && (
                  <p className="mt-1 text-red-500"><span className="text-gray-400">เหตุผลที่ไม่อนุมัติ:</span> <span className="font-bold">{sel.Reject_Reason}</span></p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
