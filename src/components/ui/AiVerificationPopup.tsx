'use client';

export interface AiVerificationResult {
  aiSteps: number | null;
  aiStepsRaw: string | null;
  dateRaw: string | null;
  dateNormalized: string | null;
  dateMatch: boolean | null;
  confidence: number | null;
  stepsExact: boolean | null;
  alert: boolean;
  alertReason: string;
  expectedDate: string;
  inputSteps: number | null;
  rawText?: string;
}

interface Props {
  open: boolean;
  preview: string | null;
  inputSteps: number | null;
  expectedDate: string;
  result: AiVerificationResult | null;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  onEdit?: () => void;
}

function formatThaiDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T12:00:00');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543}`;
}

export default function AiVerificationPopup({ open, preview, inputSteps, expectedDate, result, loading, onConfirm, onClose, onEdit }: Props) {
  if (!open) return null;

  const stepsMatch = result?.stepsExact;
  const dateMatch = result?.dateMatch;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${result?.alert ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <span className="material-symbols-outlined">{result?.alert ? 'warning' : 'verified'}</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">ผลตรวจสอบ AI — ภาพนับก้าว</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">วันที่เลือกบันทึก: {formatThaiDate(expectedDate)} ({expectedDate})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="loading loading-spinner loading-lg text-emerald-600"></span>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">AI กำลังอ่านภาพ...</p>
              <p className="text-xs text-gray-400">ใช้ Typhoon OCR ประมวลผล — รอสักครู่</p>
            </div>
          )}

          {!loading && preview && (
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ภาพหลักฐาน" className="w-full max-h-56 object-contain" />
            </div>
          )}

          {!loading && result && (
            <>
              {/* สรุปจำนวนก้าว */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3 border bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400">จำนวนก้าวที่กรอก</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white">{inputSteps != null ? inputSteps.toLocaleString() : '—'} <span className="text-xs font-normal text-gray-400">ก้าว</span></p>
                </div>
                <div className={`rounded-xl p-3 border ${stepsMatch === false ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' : stepsMatch === true ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'}`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400">AI อ่านได้</p>
                  <p className={`text-xl font-black ${stepsMatch === false ? 'text-red-600 dark:text-red-400' : stepsMatch === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {result.aiSteps != null ? result.aiSteps.toLocaleString() : '—'} <span className="text-xs font-normal text-gray-400">ก้าว</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">ดิบ: {result.aiStepsRaw || '—'} {result.confidence != null && `· มั่นใจ ${Math.round(result.confidence*100)}%`}</p>
                  {stepsMatch === true && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span>ตรงกัน</p>}
                  {stepsMatch === false && <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-sm">cancel</span>ไม่ตรง</p>}
                  {stepsMatch == null && <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">อ่านไม่ชัดเจน</p>}
                </div>
              </div>

              {/* สรุปวันที่ */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3 border bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400">วันที่เลือกบันทึก</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{formatThaiDate(expectedDate)}</p>
                  <p className="text-xs text-gray-400">{expectedDate}</p>
                </div>
                <div className={`rounded-xl p-3 border ${dateMatch === false ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' : dateMatch === true ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'}`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400">วันที่ในภาพ</p>
                  <p className={`text-sm font-bold ${dateMatch === false ? 'text-red-600 dark:text-red-400' : dateMatch === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {result.dateRaw || '— ไม่พบ'}
                  </p>
                  <p className="text-xs text-gray-400">normalize: {result.dateNormalized || '—'}</p>
                  {dateMatch === true && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span>ตรงกัน</p>}
                  {dateMatch === false && <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-sm">cancel</span>ไม่ตรง</p>}
                  {dateMatch == null && <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">อ่านไม่ชัดเจน</p>}
                </div>
              </div>

              {/* Alert */}
              {result.alert && result.alertReason && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <span className="material-symbols-outlined text-lg shrink-0">info</span>
                  <span>{result.alertReason} — จะบันทึกเป็น <strong>รอตรวจสอบ (Pending)</strong> ให้เจ้าหน้าที่ นสส. ต่างฝ่ายตรวจอีกครั้ง</span>
                </div>
              )}
              {!result.alert && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <span className="material-symbols-outlined">verified</span>
                  ตรงกันเป๊ะ — จะบันทึกและอนุมัติทันที (ไม่ต้องรอตรวจ)
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                หากไม่มั่นใจ สามารถกดบันทึกแล้วส่งให้เจ้าหน้าที่ นสส. ฝ่ายอื่นตรวจสอบได้ — ระบบจะแสดงรายละเอียดนี้ที่หน้า ตรวจสอบนับก้าว ด้วย
              </p>
            </>
          )}
        </div>

        {/* Footer — เหลือปุ่มแก้ไข 1 ปุ่ม + ยืนยัน */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
          <button onClick={onEdit ?? onClose} disabled={!!loading} className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-lg">edit</span>
            แก้ไขยอด
          </button>
          <button onClick={onConfirm} disabled={!!loading} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 disabled:opacity-50 ${result?.alert ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            <span className="material-symbols-outlined text-lg">{result?.alert ? 'hourglass' : 'check_circle'}</span>
            {result?.alert ? 'ยืนยันบันทึก (รอตรวจ)' : 'ยืนยันบันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
