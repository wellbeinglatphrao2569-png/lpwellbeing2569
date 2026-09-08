'use client';
import type { AiVerificationResult } from './AiVerificationPopup';

export interface BatchAiItem extends AiVerificationResult {
  uid: string;
  displayName: string;
  day: string;
  inputSteps: number;
  preview: string;
}

interface Props {
  open: boolean;
  items: BatchAiItem[];
  weekLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function formatThaiShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T12:00:00');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function AiBatchSummaryPopup({ open, items, weekLabel, loading, onConfirm, onClose }: Props) {
  if (!open) return null;
  const alertCount = items.filter(i => i.alert).length;
  const okCount = items.length - alertCount;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">fact_check</span>
                สรุปตรวจสอบ AI — แบบกลุ่ม
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{weekLabel} · ทั้งหมด {items.length} รายการ · ตรงเป๊ะ {okCount} · รอตรวจ {alertCount}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <span className="loading loading-spinner loading-lg text-emerald-600"></span>
              <p className="text-sm font-bold">AI กำลังอ่านภาพ {items.length} รายการ...</p>
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">ไม่มีรายการให้ตรวจสอบ</p>
          )}
          {!loading && (
            <div className="rounded-xl p-4 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              <p>
                ภาพรวมสัปดาห์ <strong>{weekLabel}</strong> มีทั้งหมด <strong>{items.length} รายการ</strong> ระบบ AI ตรวจสอบแล้วพบว่าตรงกันพอดี <strong className="text-emerald-600">{okCount} รายการ</strong> และต้องส่งให้เจ้าหน้าที่ช่วยดูอีก <strong className="text-amber-600">{alertCount} รายการ</strong>
              </p>
              <p className="mt-2">
                {alertCount === 0
                  ? 'ทุกภาพมีทั้งวันที่และจำนวนก้าวตรงกับที่กรอกไว้ ระบบจะบันทึกและอนุมัติทันทีโดยไม่ต้องรอตรวจ'
                  : 'รายการที่ต้องรอตรวจมักเกิดจากวันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก หรือ AI อ่านจำนวนก้าวได้ไม่ชัด/ไม่ตรงกับที่กรอก — ระบบจะบันทึกเป็น รอตรวจสอบ (Pending) ให้เจ้าหน้าที่ นสส. ต่างฝ่ายช่วยพิจารณา'}
              </p>
            </div>
          )}
          {!loading && items.map((it, idx) => (
            <div key={idx} className={`rounded-xl border p-3 ${it.alert ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700' : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-700'}`}>
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.preview} alt="" className="w-16 h-16 rounded-lg object-cover border bg-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{it.displayName} · {formatThaiShort(it.day)}</p>
                  <p className="text-xs leading-relaxed mt-1 text-gray-600 dark:text-gray-300">
                    สำหรับวันที่ <strong>{formatThaiShort(it.day)}</strong> คุณกรอก <strong>{it.inputSteps.toLocaleString()} ก้าว</strong> ส่วน AI อ่านจากภาพได้ <strong className={it.stepsExact === false ? 'text-red-600' : it.stepsExact === true ? 'text-emerald-600' : 'text-amber-600'}>{it.aiSteps != null ? `${it.aiSteps.toLocaleString()} ก้าว` : 'ไม่ชัด'}</strong> {it.confidence != null && `(มั่นใจ ${Math.round(it.confidence*100)}%)`} {it.stepsExact === true ? 'ถือว่าตรงกัน' : it.stepsExact === false ? 'จึงไม่ตรงกัน' : 'จึงยังสรุปไม่ได้'} — ส่วนวันที่ AI เห็นคือ <strong className={it.dateMatch === false ? 'text-red-600' : it.dateMatch === true ? 'text-emerald-600' : 'text-amber-600'}>“{it.dateRaw || '—'}”</strong> แปลงเป็น {it.dateNormalized || '—'} {it.dateMatch === true ? 'ตรงกับวันที่เลือก' : it.dateMatch === false ? 'ไม่ตรงกับวันที่เลือก' : 'จึงเทียบไม่ได้'} {it.alert ? 'จึงต้องรอเจ้าหน้าที่ช่วยตรวจ' : 'จึงผ่านและจะอนุมัติทันที'}
                  </p>
                </div>
              </div>
              {it.alert && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 leading-relaxed bg-amber-100/50 dark:bg-amber-900/20 rounded-lg px-2.5 py-1.5">เหตุผล: {it.alertReason}</p>}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm">แก้ไข</button>
          <button onClick={onConfirm} disabled={!!loading} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50">
            ยืนยันบันทึก {items.length} รายการ {alertCount > 0 && `(รอตรวจ ${alertCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
