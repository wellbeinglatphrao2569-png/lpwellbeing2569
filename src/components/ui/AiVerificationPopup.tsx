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
              {/* เรียงความอธิบายผล — แบบรายบุคคล */}
              <div className="rounded-xl p-4 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50 border border-gray-200 dark:border-gray-700 leading-relaxed text-sm text-gray-700 dark:text-gray-300">
                <p>
                  ภาพที่คุณอัปโหลดสำหรับวันที่ <strong className="text-gray-900 dark:text-white">{formatThaiDate(expectedDate)}</strong> (<span className="font-mono text-xs">{expectedDate}</span>) ได้รับการตรวจสอบโดย AI เรียบร้อยแล้ว
                </p>
                <p className="mt-2">
                  {result.dateRaw ? (
                    <>
                      AI พบข้อความวันที่ในภาพว่า <strong className={dateMatch === true ? 'text-emerald-600' : dateMatch === false ? 'text-red-600' : 'text-amber-600'}>“{result.dateRaw}”</strong> ซึ่งแปลงเป็นสากลได้เป็น <strong>{result.dateNormalized || '—'}</strong> {dateMatch === true ? 'ตรงกับวันที่คุณเลือกบันทึกพอดี' : dateMatch === false ? `ไม่ตรงกับวันที่คุณเลือก (จึงถือว่าไม่ผ่านการเทียบวันที่)` : 'แต่ยังอ่านได้ไม่ชัดเจน จึงต้องให้เจ้าหน้าที่ช่วยดูอีกครั้ง'}
                    </>
                  ) : (
                    <>AI ยังไม่พบข้อความวันที่ที่ชัดเจนในภาพ จึงไม่สามารถเทียบวันที่ได้ — ระบบจะส่งให้เจ้าหน้าที่ช่วยตรวจสอบ</>
                  )}
                </p>
                <p className="mt-2">
                  {result.aiSteps != null ? (
                    <>
                      ส่วนจำนวนก้าว คุณกรอกไว้ <strong>{inputSteps?.toLocaleString()} ก้าว</strong> ในขณะที่ AI อ่านจากภาพได้ <strong className={stepsMatch === true ? 'text-emerald-600' : stepsMatch === false ? 'text-red-600' : 'text-amber-600'}>{result.aiSteps.toLocaleString()} ก้าว</strong> {result.confidence != null && `(ความมั่นใจ ${Math.round(result.confidence*100)}%)`} {stepsMatch === true ? 'ถือว่าตรงกัน' : stepsMatch === false ? 'จึงถือว่าไม่ตรงกัน' : 'แต่ยังอ่านได้ไม่ชัด'}
                    </>
                  ) : (
                    <>ส่วนจำนวนก้าว AI ยังอ่านจากภาพไม่ได้ชัดเจน (อาจเพราะภาพเบลอหรือตัวเลขถูกบัง) — ระบบจึงต้องส่งให้เจ้าหน้าที่ช่วยดู</>
                  )}
                </p>
                <p className="mt-2 font-medium">
                  {result.alert ? (
                    <>สรุป: ครั้งนี้ยังไม่ผ่านการตรวจสอบอัตโนมัติ — ระบบจะบันทึกเป็น <strong className="text-amber-600">รอตรวจสอบ (Pending)</strong> และส่งต่อให้เจ้าหน้าที่ นสส. ต่างฝ่ายพิจารณา คุณยังสามารถกด “ยืนยันบันทึก (รอตรวจ)” เพื่อส่งต่อได้เลย หากไม่แน่ใจให้กด “แก้ไขยอด” เพื่อกลับไปแก้ตัวเลขหรือเปลี่ยนภาพก่อน</>
                  ) : (
                    <>สรุป: ทั้งวันที่และจำนวนก้าวตรงกันพอดี — ระบบจะบันทึกและ <strong className="text-emerald-600">อนุมัติทันที</strong> โดยไม่ต้องรอเจ้าหน้าที่ตรวจ</>
                  )}
                </p>
                {result.alert && result.alertReason && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">เหตุผลเพิ่มเติม: {result.alertReason}</p>
                )}
              </div>

              {/* รายละเอียดย่อสำหรับอ้างอิง */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/30 p-2.5 border border-gray-200 dark:border-gray-600">
                  <p className="text-gray-400">วันที่เลือก</p><p className="font-bold text-gray-900 dark:text-white">{formatThaiDate(expectedDate)}</p><p className="font-mono text-[11px] text-gray-400">{expectedDate}</p>
                </div>
                <div className={`rounded-lg p-2.5 border ${dateMatch === false ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : dateMatch === true ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'}`}>
                  <p className="text-gray-400">วันที่ในภาพ (AI)</p><p className="font-bold">{result.dateRaw || '—'}</p><p className="font-mono text-[11px] text-gray-400">{result.dateNormalized || '—'} {dateMatch === true ? '✓' : dateMatch === false ? '✗' : '?'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/30 p-2.5 border border-gray-200 dark:border-gray-600">
                  <p className="text-gray-400">ก้าวที่กรอก</p><p className="font-bold text-gray-900 dark:text-white">{inputSteps?.toLocaleString()} ก้าว</p>
                </div>
                <div className={`rounded-lg p-2.5 border ${stepsMatch === false ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : stepsMatch === true ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'}`}>
                  <p className="text-gray-400">ก้าวที่ AI อ่าน</p><p className="font-bold">{result.aiSteps != null ? `${result.aiSteps.toLocaleString()} ก้าว` : '—'} <span className="text-[11px] font-normal text-gray-400">{result.confidence != null && `· ${Math.round(result.confidence*100)}%`}</span></p>
                </div>
              </div>
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
