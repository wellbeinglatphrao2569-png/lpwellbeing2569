'use client';
import { useState, useEffect } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import ResultPopup from '@/components/ui/ResultPopup';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postDataJson } from '@/services/api';

function toThaiDateShort(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${Number(m[3])} ${thaiMonths[Number(m[2])-1]} ${Number(m[1])+543}`;
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('2026-08-24');
  const [endDate, setEndDate] = useState('2026-11-13');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState<null | 'steps' | 'sweet' | 'all'>(null);
  const [cleaning, setCleaning] = useState(false);
  const [resultPopup, setResultPopup] = useState<{type:'success'|'error', title:string, message:string}|null>(null);

  async function loadWindow() {
    setLoading(true);
    const data = await fetchData<any>('project-window');
    if (data && data.start && data.end) {
      setStartDate(String(data.start).slice(0,10));
      setEndDate(String(data.end).slice(0,10));
    }
    setLoading(false);
  }
  useEffect(()=> { loadWindow(); }, []);

  async function handleSave() {
    setConfirmSave(false);
    if (!user) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setResultPopup({type:'error', title:'รูปแบบวันที่ไม่ถูกต้อง', message:'กรุณาใช้รูปแบบ YYYY-MM-DD'});
      return;
    }
    if (startDate > endDate) {
      setResultPopup({type:'error', title:'วันที่ไม่ถูกต้อง', message:'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด'});
      return;
    }
    setSaving(true);
    const res = await postDataJson('set-project-window', { Logged_By: user.User_ID, Start_Date: startDate, End_Date: endDate });
    setSaving(false);
    if (res?.success) {
      setResultPopup({type:'success', title:'บันทึกสำเร็จ', message: res.message || `ตั้งห้วงเวลาเป็น ${startDate} ถึง ${endDate} สำเร็จ`});
    } else {
      setResultPopup({type:'error', title:'บันทึกไม่สำเร็จ', message: res?.message || res?.error || 'เกิดข้อผิดพลาด'});
    }
  }

  async function handleCleanup(target: 'steps'|'sweet'|'all') {
    setConfirmCleanup(null);
    if (!user) return;
    setCleaning(true);
    const res = await postDataJson('cleanup-out-of-window', { Logged_By: user.User_ID, targets: target });
    setCleaning(false);
    if (res?.success) {
      setResultPopup({type:'success', title:'ล้างข้อมูลนอกห้วงสำเร็จ', message: res.message || `ลบ Steps ${res.cleaned?.stepsDeleted ?? 0} แถว, Sweet ${res.cleaned?.sweetDeleted ?? 0} แถว`});
    } else {
      setResultPopup({type:'error', title:'ล้างไม่สำเร็จ', message: res?.message || res?.error || 'เกิดข้อผิดพลาด'});
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">ตั้งค่าห้วงเวลาบันทึกข้อมูล</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">กำหนดระยะเวลาที่อนุญาตให้บันทึกข้อมูลก้าวเดินและวันพุธงดน้ำหวาน — นอกห้วงจะไม่รับข้อมูลและสามารถลบออกจากฐานข้อมูลได้</p>
      </div>

      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="material-symbols-outlined text-emerald-600 text-2xl">date_range</span>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">ห้วงเวลาปัจจุบัน</h3>
          <span className="ml-auto px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200">
            {toThaiDateShort(startDate)} — {toThaiDateShort(endDate)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-medium text-gray-700 dark:text-gray-300 text-sm block mb-1.5">วันที่เริ่ม (Start)</label>
            <input type="date" value={startDate} onChange={e=> setStartDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">ค่าเริ่มต้น: 2026-08-24 (24 ส.ค. 2569)</p>
          </div>
          <div>
            <label className="font-medium text-gray-700 dark:text-gray-300 text-sm block mb-1.5">วันที่สิ้นสุด (End)</label>
            <input type="date" value={endDate} onChange={e=> setEndDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">ค่าเริ่มต้น: 2026-11-13 (13 พ.ย. 2569)</p>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <span className="material-symbols-outlined text-sm align-middle mr-1">warning</span>
          ข้อมูลที่บันทึก <strong>นอกห้วง</strong> จะถูกปฏิเสธ (บันทึกไม่สำเร็จ) — ข้อมูลเก่าที่อยู่นอกห้วงจะไม่ถูกนับและสามารถกด <strong>“ลบข้อมูลนอกห้วง”</strong> ด้านล่างเพื่อลบออกจากฐานข้อมูลถาวร
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={()=> setConfirmSave(true)} disabled={saving} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 flex items-center gap-2">
            {saving ? <><span className="loading loading-spinner loading-xs"></span> กำลังบันทึก...</> : <><span className="material-symbols-outlined text-lg">save</span> บันทึกห้วงเวลา</>}
          </button>
          <button onClick={loadWindow} className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm">รีเฟรช</button>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="material-symbols-outlined text-red-500">delete_forever</span>ลบข้อมูลนอกห้วงเวลาออกจากฐานข้อมูล</h3>
        <p className="text-xs text-gray-500 mt-1">จะลบเฉพาะรายการที่ <strong>Date_Thai / Wednesday_Date นอกช่วง {startDate} – {endDate}</strong> เท่านั้น — ข้อมูลในห้วงจะไม่ถูกลบ</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={()=> setConfirmCleanup('steps')} disabled={cleaning} className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 font-bold text-sm disabled:opacity-50">ลบก้าวนอกห้วง (Steps_Log)</button>
          <button onClick={()=> setConfirmCleanup('sweet')} disabled={cleaning} className="px-4 py-2 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 text-orange-700 dark:text-orange-400 font-bold text-sm disabled:opacity-50">ลบงดหวานนอกห้วง (Sweet_Free)</button>
          <button onClick={()=> setConfirmCleanup('all')} disabled={cleaning} className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">ลบทั้งหมดนอกห้วง</button>
        </div>
        {cleaning && <p className="text-xs text-gray-400 mt-2 flex items-center gap-2"><span className="loading loading-spinner loading-xs"></span> กำลังลบ...</p>}
      </GlassCard>

      <ConfirmPopup open={confirmSave} title="ยืนยันการเปลี่ยนห้วงเวลา" message={`คุณกำลังจะเปลี่ยนห้วงเวลาบันทึกเป็น ${toThaiDateShort(startDate)} ถึง ${toThaiDateShort(endDate)} — ข้อมูลนอกห้วงใหม่จะไม่รับเข้าสู่ระบบ แน่ใจหรือไม่?`} variant="warning" loading={saving} onConfirm={handleSave} onClose={()=> setConfirmSave(false)} />
      <ConfirmPopup open={!!confirmCleanup} title="ยืนยันการลบข้อมูลนอกห้วง" message={`คุณกำลังจะลบข้อมูล ${confirmCleanup==='steps'?'ก้าวเดิน':confirmCleanup==='sweet'?'งดหวาน':'ก้าวเดิน+งดหวาน'} ที่อยู่นอกห้วง ${toThaiDateShort(startDate)} – ${toThaiDateShort(endDate)} ออกจากฐานข้อมูลถาวร — ลบแล้วต้องกรอกใหม่ แน่ใจหรือไม่?`} variant="danger" loading={cleaning} onConfirm={()=> confirmCleanup && handleCleanup(confirmCleanup)} onClose={()=> setConfirmCleanup(null)} />
      {resultPopup && <ResultPopup open={!!resultPopup} type={resultPopup.type} title={resultPopup.title} message={resultPopup.message} onClose={()=> setResultPopup(null)} />}
    </div>
  );
}
