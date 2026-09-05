'use client';

import { thaiMonths, thaiShortMonths, getThaiNow } from '@/utils/thaiDate';
import type { User, StepsLog, SweetFree } from '@/types';

// ===== helpers =====
function fmtThaiFullRange(startKey: string, endKey: string) {
  if (!startKey || !endKey) return '-';
  const a = new Date(startKey + 'T12:00:00');
  const b = new Date(endKey + 'T12:00:00');
  const beA = a.getFullYear() + 543;
  const beB = b.getFullYear() + 543;
  const mA = thaiMonths[a.getMonth()];
  const mB = thaiMonths[b.getMonth()];
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} - ${b.getDate()} ${mA} พ.ศ. ${beA}`;
  }
  return `${a.getDate()} ${mA} - ${b.getDate()} ${mB} พ.ศ. ${beB}`;
}
function fmtWedShort(key: string) {
  if (!key) return '-';
  const d = new Date(key + 'T12:00:00');
  return `${d.getDate()} ${thaiShortMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function isOtherSweet(s: SweetFree) {
  const st = String((s as any).Status || '').trim().toUpperCase();
  const r = String((s as any).Reason || '').trim();
  return st === 'OTHER' || st === 'อื่นๆ' || st.startsWith('OTHER') || r !== '';
}
function isTrue(val: unknown) {
  if (val === true) return true;
  const s = String(val ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}
function formatPrintDate() {
  const thai = getThaiNow();
  const d = new Date(thai.getUTCFullYear(), thai.getUTCMonth(), thai.getUTCDate());
  // getThaiNow returns Date shifted, but use thai object directly
  const year = thai.getUTCFullYear() + 543;
  const month = thaiMonths[thai.getUTCMonth()];
  const day = thai.getUTCDate();
  const hh = String(thai.getUTCHours()).padStart(2, '0');
  const mm = String(thai.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} เวลา ${hh}:${mm} น.`;
}

// ===== types =====
export interface WeeklyComputed {
  weekLabel: string;
  weekStartKey: string;
  weekEndKey: string;
  wednesdayKey: string;
  weekNumber: number;
  totalStepsWeek: number;
  totalStepsWeekCapped?: number;
  participantsWeek: number;
  participantsTotal: number;
  deptWeek: { name: string; steps: number; stepsActual?: number; participants: number; active?: number; avg: number; avgActual?: number }[];
  deptCumulative: { name: string; steps: number; stepsActual?: number; participants: number; active?: number; avg: number; avgActual?: number }[];
  top5Week: { user: User; steps: number }[];
  top3ByDeptWeek: { dept: string; rows: { user: User; steps: number }[] }[];
  top10Cumulative: { user: User; steps: number; weekSteps: number }[];
  sweetWeekOverall: { kept: number; failed: number; other: number; total: number };
  sweetWeekByDept: { dept: string; kept: number; failed: number; other: number; total: number; rate: number }[];
  sweetCumulativeOverall: { kept: number; failed: number; other: number; total: number };
  sweetCumulativeByWeek: { wedKey: string; kept: number; failed: number; other: number }[];
  rankingCriteria?: string;
}

export default function WeeklyReportDocument({
  computed,
  weekNumber,
  programStart,
  programEnd,
}: {
  computed: WeeklyComputed | null;
  weekNumber: number;
  programStart: string;
  programEnd: string;
}) {
  if (!computed) {
    return (
      <div className="bg-white text-gray-400 flex items-center justify-center h-[400px] border rounded-2xl">
        กำลังโหลดข้อมูลรายงาน...
      </div>
    );
  }
  const c = computed;
  const rangeLabel = fmtThaiFullRange(c.weekStartKey, c.weekEndKey);
  const wedLabel = fmtWedShort(c.wednesdayKey);
  const sumDeptWeek = c.deptWeek.reduce((s, d) => s + d.steps, 0);

  return (
    <div id="weekly-report-print" className="report-root bg-[#f0f2f5] p-4 md:p-6 print:p-0 print:bg-white" style={{ fontFamily: "'Sarabun','TH Sarabun PSK',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        .report-root, .report-page { font-family: 'Sarabun','TH Sarabun PSK',system-ui,sans-serif; }
        /* ยึด A4 แนวตั้ง 210×297 mm — แถบล่าง 25mm เป็นพื้นที่ Footer เฉพาะ เนื้อหาไม่ล้ำ */
        @page {
          size: A4 portrait;
          size: 210mm 297mm;
          margin: 10mm 15mm 25mm 15mm;
        }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0 !important; padding: 0 !important; background: white !important; orphans: 3; widows: 3; }
          .no-print { display: none !important; }
          .report-root { background: white !important; padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
          .report-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; break-after: auto !important; page-break-after: auto !important; break-inside: auto; box-sizing: border-box; }
          /* ไหลต่อเนื่อง — ปล่อยไหลตาม A4 ได้เรื่อยๆ */
          table { break-inside: auto !important; page-break-inside: auto !important; border-collapse: collapse !important; width: 100% !important; max-width: 100% !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          tr, tbody, td, th { break-inside: auto !important; page-break-inside: auto !important; }
          .section-block { break-inside: auto !important; page-break-inside: auto !important; }
          .section-title { break-inside: auto !important; page-break-inside: auto !important; break-after: auto !important; page-break-after: auto !important; }
          .keep-together { break-inside: auto !important; page-break-inside: auto !important; }
          .rounded-xl, .rounded-lg, .report-card { break-inside: auto !important; page-break-inside: auto !important; }
          /* Footer แถบล่างเฉพาะ — ไม่ทับเนื้อหา (อยู่ใน margin 25mm) + ตัดเนื้อหาก่อนถึง */
          .print-footer { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; height: 15mm !important; background: white !important; border-top: 0.6pt solid #e5e7eb !important; display: flex !important; align-items: center !important; justify-content: flex-end !important; padding-right: 15mm !important; padding-bottom: 3mm !important; font-size: 7.5pt !important; color: #6b7280 !important; font-family: 'Sarabun', sans-serif !important; z-index: 9999 !important; }
          .print-footer::after { content: "หน้า " counter(page); }
        }
        @media screen {
          .print-footer { display: none !important; }
        }
      `}</style>

      {/* ===== PAGE 1 ===== */}
      <div className="report-page bg-white mx-auto max-w-[210mm] shadow-lg border border-gray-200 print:shadow-none print:border-none mb-6 print:mb-0">
        {/* header */}
        <div className="border-b-[3px] border-emerald-600 px-6 pt-5 pb-4">
          <div className="flex items-center gap-4">
            <img src="/Logo.png" alt="ลาดพร้าวสร้างสุข" className="w-[72px] h-[72px] object-contain shrink-0" />
            <div className="flex-1 text-center">
              <h1 className="text-[15px] font-bold text-gray-900 leading-tight">แบบรายงานการสร้างเสริมสุขภาวะภายในหน่วยงาน</h1>
              <h2 className="text-[13px] font-bold text-emerald-700">สำนักงานเขตลาดพร้าว กรุงเทพมหานคร</h2>
              <h3 className="text-[12px] font-semibold text-gray-600 mt-0.5">รายงานผลกิจกรรมสร้างสุขภาวะ รายสัปดาห์</h3>
            </div>
            <div className="w-[72px] shrink-0" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[9.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div><span className="font-semibold">สัปดาห์ที่:</span> {weekNumber} / {new Date(c.weekStartKey).getFullYear() + 543} &nbsp;|&nbsp; {rangeLabel} (จ. - อา.)</div>
            <div className="text-right"><span className="font-semibold">ห้วงโครงการ:</span> {fmtWedShort(programStart)} - {fmtWedShort(programEnd)}</div>
            <div><span className="font-semibold">วันพุธในสัปดาห์:</span> {wedLabel} &nbsp; วันพุธที่ {c.wednesdayKey ? new Date(c.wednesdayKey + 'T12:00:00').getDate() : '-'} {c.wednesdayKey ? thaiMonths[new Date(c.wednesdayKey + 'T12:00:00').getMonth()] : ''} {c.wednesdayKey ? new Date(c.wednesdayKey + 'T12:00:00').getFullYear() + 543 : ''}</div>
            <div className="text-right"><span className="font-semibold">วันที่ออกรายงาน:</span> {formatPrintDate()}</div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* เกณฑ์ - banner */}
          {c.rankingCriteria && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[8.5px] leading-snug text-amber-900">
              <span className="font-bold">เกณฑ์การจัดอันดับส่วนราชการ:</span> {c.rankingCriteria.replace('ℹ️ ', '')}
            </div>
          )}
          {/* 1 */}
          <div className="rounded-xl border-2 border-emerald-600 overflow-hidden keep-together">
            <div className="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5">1. จำนวนก้าวรวมทั้งสำนักงานเขตลาดพร้าว (สัปดาห์นี้)</div>
            <div className="text-center py-4 bg-emerald-50/50">
              <div className="text-[32px] font-black text-emerald-700 leading-none tabular-nums">{c.totalStepsWeek.toLocaleString()} <span className="text-[14px] font-bold">ก้าว</span> <span className="text-[11px] font-normal text-emerald-700/70">(Uncapped 100%)</span></div>
              <div className="text-[10px] text-gray-600 mt-1">จากบุคลากรที่ส่งข้อมูล {c.participantsWeek} / {c.participantsTotal} คน ({c.participantsTotal ? ((c.participantsWeek / c.participantsTotal) * 100).toFixed(1) : '0'}%) &nbsp;|&nbsp; เฉลี่ย {c.participantsWeek ? Math.round(c.totalStepsWeek / c.participantsWeek).toLocaleString() : '0'} ก้าว/คน/สัปดาห์</div>
            </div>
          </div>

          {/* 2 - uncapped */}
          <div className="section-block">
            <div className="section-title bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">2. ตารางจำนวนก้าวรายฝ่าย ประจำสัปดาห์นี้ — ค่าเฉลี่ย = ผลรวมจริง ÷ จำนวนคนทั้งหมด (Uncapped · เรียงมาก → น้อย)</div>
            <table className="w-full text-[9px] border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="border border-gray-300 px-1.5 py-1 w-[36px]">ลำดับ</th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left">ส่วนราชการ/ฝ่าย</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[50px]">ทั้งหมด</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[50px]">ส่งแล้ว</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[78px]">ก้าวรวม</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[68px]">เฉลี่ย/คน</th>
                </tr>
              </thead>
              <tbody>
                {c.deptWeek.length === 0 ? (
                  <tr><td colSpan={6} className="border border-gray-300 px-2 py-4 text-center text-gray-400">ไม่มีข้อมูลก้าวที่อนุมัติในสัปดาห์นี้</td></tr>
                ) : c.deptWeek.map((d, i) => {
                  const safeAvg = Number.isFinite(d.avg) ? d.avg : 0;
                  return (
                    <tr key={d.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold">{i + 1}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{d.name}</td>
                      <td className="border border-gray-300 px-1 py-1 text-center">{d.participants ?? 0}</td>
                      <td className="border border-gray-300 px-1 py-1 text-center">{(d as any).active ?? '-'}</td>
                      <td className="border border-gray-300 px-1 py-1 text-right tabular-nums font-semibold">{d.steps.toLocaleString()} <span className="text-gray-400 font-normal">({(d.stepsActual ?? d.steps).toLocaleString()})</span></td>
                      <td className="border border-gray-300 px-1 py-1 text-right tabular-nums">{safeAvg.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {c.deptWeek.length > 0 && (
                  <tr className="bg-amber-50 font-bold">
                    <td colSpan={4} className="border border-gray-300 px-1.5 py-1 text-right">รวม  {c.deptWeek.length} ฝ่าย</td>
                    <td className="border border-gray-300 px-1 py-1 text-right tabular-nums">{sumDeptWeek.toLocaleString()}</td>
                    <td className="border border-gray-300 px-1 py-1"></td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="text-[7px] text-gray-500 mt-1">ทั้งหมด = คนทั้งหมดในฝ่าย (รวม_PENDING ไม่นับ Inactive) · ส่งแล้ว = คนที่มีก้าว &gt;0 · ก้าวรวม = ผลรวมจริง 100% (Uncapped ไม่ตัดเพดาน)</div>
          </div>

          {/* 3 */}
          <div className="section-block">
            <div className="section-title bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">3. ตารางจำนวนก้าวสะสมรายฝ่าย — ผลรวมจริง ÷ จำนวนคนทั้งหมด (Uncapped) ตั้งแต่เริ่มโครงการ ถึงสัปดาห์ล่าสุด (เรียงมาก → น้อย)</div>
            <table className="w-full text-[9px] border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="border border-gray-300 px-1.5 py-1 w-[36px]">ลำดับ</th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left">ส่วนราชการ/ฝ่าย</th>
                    <th className="border border-gray-300 px-1.5 py-1 w-[78px]">ก้าวสะสม</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[56px]">สัดส่วน</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[64px]">ทั้งหมด</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[56px]">เฉลี่ย/คน</th>
                </tr>
              </thead>
              <tbody>
                {c.deptCumulative.length === 0 ? (
                  <tr><td colSpan={6} className="border border-gray-300 px-2 py-4 text-center text-gray-400">ไม่มีข้อมูลสะสม</td></tr>
                ) : (() => {
                  const totalCum = c.deptCumulative.reduce((s, d) => s + d.steps, 0);
                  return c.deptCumulative.map((d, i) => {
                    const safeAvg = Number.isFinite(d.avg) ? d.avg : 0;
                    return (
                      <tr key={d.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-1 py-1 text-center font-bold">{i + 1}</td>
                        <td className="border border-gray-300 px-1.5 py-1">{d.name}</td>
                        <td className="border border-gray-300 px-1 py-1 text-right tabular-nums font-semibold">{d.steps.toLocaleString()} <span className="text-gray-400 font-normal">({(d.stepsActual ?? d.steps).toLocaleString()})</span></td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums">{totalCum ? ((d.steps / totalCum) * 100).toFixed(1) : '0'}%</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{d.participants ?? 0}</td>
                        <td className="border border-gray-300 px-1 py-1 text-right tabular-nums">{safeAvg.toLocaleString()}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
            <div className="text-[7px] text-gray-500 mt-1">ก้าวสะสม = ผลรวมจริง 100% ทุกวันตั้งแต่วันเริ่มโครงการ (Uncapped)</div>
          </div>

          {/* 4 */}
          <div className="section-block">
            <div className="section-title bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">4. อันดับบุคลากร Top 5 ประจำสัปดาห์นี้ (ก้าวสูงสุด)</div>
            <table className="w-full text-[9px] border-collapse border border-gray-300">
              <thead>
                <tr className="bg-emerald-50 text-emerald-800">
                  <th className="border border-gray-300 px-1.5 py-1 w-[36px]">อันดับ</th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left">ชื่อ-นามสกุล (ฝ่าย)</th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left">ตำแหน่ง</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[78px]">ก้าว</th>
                </tr>
              </thead>
              <tbody>
                {c.top5Week.length === 0 ? (
                  <tr><td colSpan={4} className="border border-gray-300 px-2 py-4 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                ) : c.top5Week.map((r, i) => (
                  <tr key={String((r.user as any).User_ID || (r.user as any).Personnel_ID || i)} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-1 py-1 text-center font-black">{i + 1}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{r.user.Prefix || ''} {r.user.Full_Name} <span className="text-gray-500">({r.user.Department})</span></td>
                    <td className="border border-gray-300 px-1.5 py-1 text-gray-600">{r.user.Position || '-'}</td>
                    <td className="border border-gray-300 px-1 py-1 text-right tabular-nums font-bold text-emerald-700">{r.steps.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        {/* — ไหลต่อเนื่อง: ไม่มีแบ่งหน้าใน Preview, พิมพ์จะตัดตาม A4 อัตโนมัติ — */}
          {/* 5 */}
          <div className="section-block">
            <div className="section-title bg-amber-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">5. อันดับบุคลากร Top 3 ประจำส่วนราชการ ประจำสัปดาห์นี้</div>
            <div className="border border-gray-300 border-t-0">
              {c.top3ByDeptWeek.length === 0 ? (
                <div className="px-3 py-6 text-center text-[10px] text-gray-400">ไม่มีข้อมูล</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {c.top3ByDeptWeek.map(group => (
                    <div key={group.dept} className="px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-800 bg-gray-50 px-2 py-1 rounded mb-1.5 inline-block">{group.dept}</div>
                      <table className="w-full text-[8.5px] border-collapse">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-semibold w-[28px]">ลำดับ</th>
                            <th className="text-left font-semibold">ชื่อ-นามสกุล</th>
                            <th className="text-left font-semibold">ตำแหน่ง</th>
                            <th className="text-right font-semibold w-[64px]">ก้าว</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.length === 0 ? (
                            <tr><td colSpan={4} className="py-1 text-gray-400 text-center">— ไม่มีผู้ส่งก้าวในฝ่ายนี้ —</td></tr>
                          ) : group.rows.map((r, idx) => (
                            <tr key={String((r.user as any).User_ID || (r.user as any).Personnel_ID || idx)} className="border-t border-gray-100">
                              <td className="py-1 font-bold text-center">{idx + 1}</td>
                              <td className="py-1">{r.user.Prefix || ''} {r.user.Full_Name}</td>
                              <td className="py-1 text-gray-600 truncate max-w-[120px]">{r.user.Position || '-'}</td>
                              <td className="py-1 text-right tabular-nums font-semibold">{r.steps.toLocaleString()}</td>
                            </tr>
                          ))}
                          {group.rows.length > 0 && group.rows.length < 3 && (
                            <>
                              {Array.from({ length: 3 - group.rows.length }).map((_, k) => (
                                <tr key={`empty-${k}`} className="border-t border-gray-100 text-gray-300">
                                  <td className="py-1 text-center">{group.rows.length + k + 1}</td>
                                  <td className="py-1">—</td>
                                  <td className="py-1">—</td>
                                  <td className="py-1 text-right">—</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[7.5px] text-gray-400 mt-1 px-1">หมายเหตุ: เรียงฝ่ายตามลำดับก้าวรวมสัปดาห์นี้ (ข้อ 2.) | แสดงเท่าที่มี หากฝ่ายมีน้อยกว่า 3 คน</div>
          </div>

          {/* 6 */}
          <div className="section-block">
            <div className="section-title bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">6. อันดับบุคลากร Top 10 ก้าวสะสมสูงสุด ตั้งแต่เริ่มโครงการ ถึงสัปดาห์ล่าสุด</div>
            <table className="w-full text-[9px] border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="border border-gray-300 px-1.5 py-1 w-[36px]">อันดับ</th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left">ชื่อ-นามสกุล (ฝ่าย)</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[78px]">ก้าวสะสม</th>
                  <th className="border border-gray-300 px-1.5 py-1 w-[78px]">ก้าวสัปดาห์นี้</th>
                </tr>
              </thead>
              <tbody>
                {c.top10Cumulative.length === 0 ? (
                  <tr><td colSpan={4} className="border border-gray-300 px-2 py-4 text-center text-gray-400">ไม่มีข้อมูลสะสม</td></tr>
                ) : c.top10Cumulative.map((r, i) => (
                  <tr key={String((r.user as any).User_ID || (r.user as any).Personnel_ID || i)} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-1 py-1 text-center font-black">{i + 1}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{r.user.Prefix || ''} {r.user.Full_Name} <span className="text-gray-500">({r.user.Department})</span></td>
                    <td className="border border-gray-300 px-1 py-1 text-right tabular-nums font-bold">{r.steps.toLocaleString()}</td>
                    <td className="border border-gray-300 px-1 py-1 text-right tabular-nums text-emerald-700">{r.weekSteps.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 7 */}
          <div className="section-block">
            <div className="section-title bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">7. สถิติกิจกรรม “พุธนี้ไม่มีเชื่อม” (งดหวานวันพุธ) ประจำสัปดาห์นี้</div>
            <div className="border border-gray-300 border-t-0 p-3 space-y-3">
              <div>
                <div className="text-[9.5px] font-bold text-gray-800 mb-1.5">7.1 ภาพรวมสำนักงานเขตลาดพร้าว — วันพุธที่ {wedLabel}</div>
                <table className="w-full text-[9px] border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-emerald-50 text-emerald-800">
                      <th className="border border-gray-300 px-2 py-1.5 w-[92px]">ถือศีล (งดได้)</th>
                      <th className="border border-gray-300 px-2 py-1.5 w-[92px]">หลุดศีล (งดไม่ได้)</th>
                      <th className="border border-gray-300 px-2 py-1.5 w-[72px]">อื่นๆ*</th>
                      <th className="border border-gray-300 px-2 py-1.5">รวมผู้บันทึก</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-center">
                      <td className="border border-gray-300 px-2 py-2 font-black text-emerald-700 text-[13px]">{c.sweetWeekOverall.kept.toLocaleString()} <span className="text-[8px] font-normal text-gray-500">({c.sweetWeekOverall.total ? ((c.sweetWeekOverall.kept / c.sweetWeekOverall.total) * 100).toFixed(1) : '0'}%)</span></td>
                      <td className="border border-gray-300 px-2 py-2 font-black text-red-600 text-[13px]">{c.sweetWeekOverall.failed.toLocaleString()} <span className="text-[8px] font-normal text-gray-500">({c.sweetWeekOverall.total ? ((c.sweetWeekOverall.failed / c.sweetWeekOverall.total) * 100).toFixed(1) : '0'}%)</span></td>
                      <td className="border border-gray-300 px-2 py-2 font-black text-gray-600 text-[13px]">{c.sweetWeekOverall.other.toLocaleString()} <span className="text-[8px] font-normal text-gray-500">({c.sweetWeekOverall.total ? ((c.sweetWeekOverall.other / c.sweetWeekOverall.total) * 100).toFixed(1) : '0'}%)</span></td>
                      <td className="border border-gray-300 px-2 py-2 text-[10px]">{c.sweetWeekOverall.total.toLocaleString()} คน {c.participantsTotal ? <span className="text-gray-500">/ {c.participantsTotal} คน</span> : ''}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-[7px] text-gray-400 mt-1">* อื่นๆ = ลาป่วย/ลากิจ/ลาพักผ่อน/อบรมนอกสถานที่ (Sweet_Free.Reason)</div>
              </div>
              <div>
                <div className="text-[9.5px] font-bold text-gray-800 mb-1.5">7.2 รายส่วนราชการ (สัปดาห์นี้)</div>
                <table className="w-full text-[8.5px] border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700">
                      <th className="border border-gray-300 px-1.5 py-1 text-left">ส่วนราชการ/ฝ่าย</th>
                      <th className="border border-gray-300 px-1 py-1 w-[52px]">ถือศีล</th>
                      <th className="border border-gray-300 px-1 py-1 w-[52px]">หลุดศีล</th>
                      <th className="border border-gray-300 px-1 py-1 w-[48px]">อื่นๆ</th>
                      <th className="border border-gray-300 px-1 py-1 w-[48px]">รวม</th>
                      <th className="border border-gray-300 px-1 py-1 w-[56px]">อัตรา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.sweetWeekByDept.length === 0 ? (
                      <tr><td colSpan={6} className="border border-gray-300 px-2 py-3 text-center text-gray-400">ไม่มีข้อมูลงดหวานสัปดาห์นี้</td></tr>
                    ) : c.sweetWeekByDept.map(d => (
                      <tr key={d.dept} className="odd:bg-white even:bg-gray-50">
                        <td className="border border-gray-300 px-1.5 py-1">{d.dept}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums font-semibold text-emerald-700">{d.kept}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums text-red-600">{d.failed}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums text-gray-600">{d.other}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums">{d.total}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center tabular-nums font-bold">{d.total ? ((d.kept / d.total) * 100).toFixed(1) : '0'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 8 */}
          <div className="section-block">
            <div className="section-title bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-t-lg">8. สถิติสะสม “พุธนี้ไม่มีเชื่อม” ตั้งแต่สัปดาห์แรก ถึงสัปดาห์ล่าสุด (ภาพรวมสำนักงาน)</div>
            <div className="border border-gray-300 border-t-0 p-3">
              <table className="w-full text-[9px] border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="border border-gray-300 px-2 py-1.5 w-[92px]">ถือศีลสะสม</th>
                    <th className="border border-gray-300 px-2 py-1.5 w-[92px]">หลุดสะสม</th>
                    <th className="border border-gray-300 px-2 py-1.5 w-[92px]">อื่นๆสะสม</th>
                    <th className="border border-gray-300 px-2 py-1.5">อัตราถือศีลเฉลี่ยสะสม</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-center">
                    <td className="border border-gray-300 px-2 py-2 font-black text-emerald-700 text-[13px]">{c.sweetCumulativeOverall.kept.toLocaleString()}</td>
                    <td className="border border-gray-300 px-2 py-2 font-black text-red-600 text-[13px]">{c.sweetCumulativeOverall.failed.toLocaleString()}</td>
                    <td className="border border-gray-300 px-2 py-2 font-black text-gray-600 text-[13px]">{c.sweetCumulativeOverall.other.toLocaleString()}</td>
                    <td className="border border-gray-300 px-2 py-2 text-[11px] font-bold">{c.sweetCumulativeOverall.total ? ((c.sweetCumulativeOverall.kept / c.sweetCumulativeOverall.total) * 100).toFixed(1) : '0'}% <span className="text-[8px] font-normal text-gray-500">({c.sweetCumulativeOverall.kept.toLocaleString()}/{c.sweetCumulativeOverall.total.toLocaleString()} ครั้ง)</span></td>
                  </tr>
                </tbody>
              </table>
              {c.sweetCumulativeByWeek.length > 1 && (
                <div className="mt-2 text-[7.5px] text-gray-500 flex flex-wrap gap-x-2 gap-y-1">
                  {c.sweetCumulativeByWeek.map(w => {
                    const total = w.kept + w.failed + w.other;
                    const rate = total ? ((w.kept / total) * 100).toFixed(0) : '0';
                    return <span key={w.wedKey} className="inline-flex items-center gap-1 border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50">{fmtWedShort(w.wedKey)} {rate}%</span>;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* certification */}
          <div className="border border-gray-400 rounded-lg px-4 py-2.5 text-center keep-together">
            <p className="text-[10px] font-bold text-gray-800">ขอรับรองว่าการรายงานข้างต้นเป็นความจริงทุกประการ</p>
          </div>

          {/* signatures */}
          <div className="border border-gray-300 rounded-lg p-4 keep-together">
            <div className="text-center mb-4">
              <p className="text-[10px]">ลงชื่อ ............................................................</p>
              <p className="text-[9px] text-gray-600">( ............................................................ )</p>
              <p className="text-[9px] font-bold text-gray-800">นักจัดการงานสร้างสุขภาวะองค์กร</p>
              <p className="text-[8px] text-gray-500">วันที่ ............ / ............................ / ....................</p>
            </div>
            <div className="grid grid-cols-2 gap-6 text-center mb-4">
              <div>
                <p className="text-[10px]">ลงชื่อ ............................................................</p>
                <p className="text-[9px] text-gray-600">( ............................................................ )</p>
                <p className="text-[9px] font-semibold">ผู้ช่วยผู้อำนวยการเขตลาดพร้าว</p>
                <p className="text-[8px] text-gray-500">(ทราบ)</p>
              </div>
              <div>
                <p className="text-[10px]">ลงชื่อ ............................................................</p>
                <p className="text-[9px] text-gray-600">( ............................................................ )</p>
                <p className="text-[9px] font-semibold">ผู้ช่วยผู้อำนวยการเขตลาดพร้าว</p>
                <p className="text-[8px] text-gray-500">(ทราบ)</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px]">ลงชื่อ ............................................................</p>
              <p className="text-[9px] text-gray-600">( ............................................................ )</p>
              <p className="text-[9px] font-bold text-gray-800">ผู้อำนวยการเขตลาดพร้าว</p>
              <p className="text-[8px] text-gray-500">(ทราบ)</p>
              <p className="text-[8px] text-gray-500 mt-1">วันที่ ............ / ............................ / ....................</p>
            </div>
          </div>

          <div className="text-[7px] text-gray-400 border-t border-gray-200 pt-2 flex justify-between">
            <span>หมายเหตุ: ข้อมูลก้าวนับเฉพาะ Approved | ส่วนราชการ = ผลรวมจริง ÷ คนทั้งหมด (Uncapped ไม่ตัดเพดาน) | สัปดาห์ จ.-อา.</span>
            <span>พิมพ์เมื่อ {formatPrintDate()}</span>
          </div>
        </div>
      </div>
      {/* Footer เลขหน้าขวาล่าง ทุกหน้า A4 (fixed จะซ้ำทุกหน้าเมื่อพิมพ์) */}
      <div className="print-footer" aria-hidden />
    </div>
  );
}
