'use client';

import { useState } from 'react';
import { shortenReason } from '@/lib/aiSummary';

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
  visualEvidence?: string | null;
  layoutPattern?: string | null;
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

function MatchChip({ value }: { value: boolean | null }) {
  if (value === true)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">✓ ตรง</span>;
  if (value === false)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">✗ ไม่ตรง</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">? ไม่ชัด</span>;
}

export default function AiVerificationPopup({ open, preview, inputSteps, expectedDate, result, loading, onConfirm, onClose, onEdit }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  if (!open) return null;

  const stepsMatch = result?.stepsExact;
  const dateMatch = result?.dateMatch;
  const passed = result ? !result.alert : false;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header — compact */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${result?.alert ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <span className="material-symbols-outlined">{result?.alert ? 'warning' : 'verified'}</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">ผลตรวจ AI — {formatThaiDate(expectedDate)}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">{expectedDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${passed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                {passed ? 'ผ่าน' : 'รอตรวจ'}
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="loading loading-spinner loading-lg text-emerald-600"></span>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">AI กำลังอ่านภาพ...</p>
            </div>
          )}

          {!loading && preview && (
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ภาพหลักฐาน" className="w-full max-h-44 object-contain" />
            </div>
          )}

          {!loading && result && (
            <>
              {/* ตารางสรุปสั้น 2 แถว */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                <div className="grid grid-cols-[86px_1fr_auto] items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs text-gray-500">ก้าว</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {inputSteps?.toLocaleString()} <span className="font-normal text-gray-400">→</span> {result.aiSteps != null ? `${result.aiSteps.toLocaleString()}` : '—'}
                    {result.confidence != null && <span className="ml-1 text-[11px] font-normal text-gray-400">{Math.round(result.confidence * 100)}%</span>}
                  </span>
                  <MatchChip value={stepsMatch ?? null} />
                </div>
                <div className="grid grid-cols-[86px_1fr_auto] items-center gap-2 px-3 py-2.5">
                  <span className="text-xs text-gray-500">วันที่</span>
                  <span className="font-bold text-gray-900 dark:text-white truncate">
                    {result.dateRaw || '—'} <span className="font-mono text-[11px] font-normal text-gray-400">{result.dateNormalized || ''}</span>
                  </span>
                  <MatchChip value={dateMatch ?? null} />
                </div>
              </div>

              {/* เหตุผลสั้น 1 บรรทัด */}
              {result.alert && result.alertReason ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 line-clamp-2" title={result.alertReason}>
                  {shortenReason(result.alertReason, 90)}
                </p>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                  ตรงกัน — {result.alert ? 'รอตรวจ' : 'อนุมัติทันที'}
                </p>
              )}

              {/* รายละเอียด (พับได้) */}
              <button onClick={() => setShowDetail((v) => !v)} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">{showDetail ? 'expand_less' : 'expand_more'}</span>
                รายละเอียดเพิ่มเติม
              </button>
              {showDetail && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1 rounded-lg bg-gray-50 dark:bg-gray-700/30 p-2.5">
                  {result.visualEvidence && <p>📍 {shortenReason(result.visualEvidence, 80)}</p>}
                  {result.layoutPattern && <p>เลย์เอาต์: {result.layoutPattern}</p>}
                  {result.rawText && <p className="font-mono break-all line-clamp-3">{result.rawText.slice(0, 200)}</p>}
                  <p>{result.alert ? 'บันทึกเป็นรอตรวจสอบ (Pending) ให้เจ้าหน้าที่ต่างฝ่ายพิจารณา' : 'วันที่และก้าวตรงกัน — อนุมัติทันที'}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
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
