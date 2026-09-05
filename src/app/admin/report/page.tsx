'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchData } from '@/services/api';
import type { User, StepsLog, SweetFree } from '@/types';
import { toDateKey } from '@/utils/thaiDate';
import { totalsInRange, PROJECT_START_DATE, PROJECT_END_DATE, RANKING_CRITERIA_TEXT, RANKING_FORMULA_DETAIL, projectWeeks } from '@/utils/stepsRanking';
import { DEPARTMENTS } from '@/utils/personnel';
import WeeklyReportDocument, { WeeklyComputed } from '@/components/report/WeeklyReportDocument';

// Monday of week containing date
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(12, 0, 0, 0);
  return x;
}
function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return toIsoLocal(x);
}
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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

export default function AdminReportPage() {
  const { isAdmin, isLoggedIn } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [steps, setSteps] = useState<StepsLog[]>([]);
  const [sweet, setSweet] = useState<SweetFree[]>([]);
  const [loading, setLoading] = useState(true);
  const weeks = useMemo(() => projectWeeks(), []);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const todayKey = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const m = new Date(d);
      m.setDate(diff);
      m.setHours(0,0,0,0);
      return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;
    })();
    const ws = projectWeeks();
    const found = ws.find(w => todayKey >= w.startKey && todayKey <= w.endKey);
    if (found) return found.startKey;
    if (ws.length===0) return todayKey;
    if (todayKey < ws[0].startKey) return ws[0].startKey;
    return ws[ws.length-1].startKey;
  });
  const [programStart] = useState(PROJECT_START_DATE);
  const [programEnd] = useState(PROJECT_END_DATE);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [u, s, sw] = await Promise.all([
        fetchData<User[]>('users'),
        fetchData<StepsLog[]>('steps'),
        fetchData<SweetFree[]>('sweet-free'),
      ]);
      if (!cancelled) {
        if (u) setUsers(u);
        if (s) setSteps(s);
        if (sw) setSweet(sw);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const targetMonday = useMemo(() => new Date(selectedWeekStart + 'T12:00:00'), [selectedWeekStart]);
  const weekStartKey = selectedWeekStart;
  const weekEndKey = useMemo(() => shift(targetMonday, 6), [targetMonday]);
  const wedKey = useMemo(() => shift(targetMonday, 2), [targetMonday]);
  const weekNumber = useMemo(() => getWeekNumber(targetMonday), [targetMonday]);

  const computed: WeeklyComputed | null = useMemo(() => {
    if (!users.length) return null;
    // participant totals = จำนวน Users ที่ไม่ Inactive
    const participantsTotal = users.filter(u => String((u as any).Registration_Status) !== 'Inactive' && String(u.Full_Name || '').trim()).length || users.length;

    // weekly totals: uncapped 100% ทั้งหมด (สเปคใหม่ 1.3 ยกเลิก cap)
    const weekMap = totalsInRange(steps, weekStartKey, weekEndKey);
    const cumMap = totalsInRange(steps, programStart, weekEndKey);

    let totalWeek = 0;
    for (const v of weekMap.values()) totalWeek += v;
    const totalWeekCapped = totalWeek;

    // helpers to get steps for user (support Personnel_ID fallback)
    function stepsFor(u: User, map: Map<string, number>): number {
      const uid = String((u as any).User_ID || '').trim();
      if (uid && map.has(uid)) return map.get(uid)!;
      const pid = String((u as any).Personnel_ID || '').trim();
      if (pid && map.has(pid)) return map.get(pid)!;
      return 0;
    }

    // dept week — uncapped avg = S_total ÷ N_registered (สเปคใหม่ 1.3)
    function buildDeptUncapped(actualMap: Map<string, number>) {
      const allCounts = new Map<string, number>();
      for (const u of users) {
        const dept = String(u.Department || '').trim();
        if (!dept) continue;
        const st = String((u as any).Registration_Status || '').trim();
        if (st === 'Inactive') continue;
        const hasName = String((u as any).Full_Name || '').trim() !== '' || String((u as any).User_ID || '').trim() !== '' || String((u as any).Personnel_ID || '').trim() !== '';
        if (!hasName) continue;
        allCounts.set(dept, (allCounts.get(dept) || 0) + 1);
      }
      const sumActual = new Map<string, number>();
      const active = new Map<string, number>();
      for (const u of users) {
        const dept = String(u.Department || '').trim();
        if (!dept) continue;
        const a = stepsFor(u, actualMap);
        if (a > 0) active.set(dept, (active.get(dept) || 0) + 1);
        if (a > 0) sumActual.set(dept, (sumActual.get(dept) || 0) + a);
      }
      const rows: { name: string; steps: number; stepsActual: number; participants: number; active: number; avg: number; avgActual: number }[] = [];
      for (const [name, totalMembers] of allCounts) {
        const ta = sumActual.get(name) || 0;
        const act = active.get(name) || 0;
        rows.push({
          name,
          steps: ta,
          stepsActual: ta,
          participants: totalMembers,
          active: act,
          avg: totalMembers ? Math.round(ta / totalMembers) : 0,
          avgActual: totalMembers ? Math.round(ta / totalMembers) : 0,
        });
      }
      for (const [name, ta] of sumActual) {
        if (!allCounts.has(name)) {
          rows.push({ name, steps: ta, stepsActual: ta, participants: active.get(name) || 0, active: active.get(name) || 0, avg: ta, avgActual: ta });
        }
      }
      return rows.sort((a, b) => b.avg - a.avg || b.steps - a.steps);
    }

    const deptWeek = buildDeptUncapped(weekMap);
    const deptCumulative = buildDeptUncapped(cumMap);

    // top 5 week
    const allWeekRows = users.map(u => ({ user: u, steps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps);
    const top5Week = allWeekRows.slice(0, 5);

    // top3 by dept week (dept order = deptWeek order, else DEPARTMENTS)
    const deptOrder = deptWeek.length ? deptWeek.map(d => d.name) : DEPARTMENTS;
    const top3ByDeptWeek = deptOrder.map(dept => {
      const rows = users.filter(u => u.Department === dept).map(u => ({ user: u, steps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps).slice(0, 3);
      return { dept, rows };
    });

    // top10 cumulative
    const allCumRows = users.map(u => ({ user: u, steps: stepsFor(u, cumMap), weekSteps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps);
    const top10Cumulative = allCumRows.slice(0, 10);

    // sweet week
    const wedSweet = sweet.filter(s => toDateKey(s.Wednesday_Date) === wedKey);
    let kept = 0, failed = 0, other = 0;
    for (const s of wedSweet) {
      if (isOtherSweet(s)) other++;
      else if (isTrue(s.Status)) kept++;
      else failed++;
    }
    const sweetWeekOverall = { kept, failed, other, total: kept + failed + other };

    // sweet by dept week
    const deptIds = new Map<string, Set<string>>();
    for (const u of users) {
      if (!u.Department) continue;
      if (!deptIds.has(u.Department)) deptIds.set(u.Department, new Set());
      const sid = deptIds.get(u.Department)!;
      if (String((u as any).User_ID || '').trim()) sid.add(String((u as any).User_ID).trim());
      if (String((u as any).Personnel_ID || '').trim()) sid.add(String((u as any).Personnel_ID).trim());
      // also map Full_Name fallback not needed for sweet (User_ID linked)
    }
    const sweetWeekByDept = [...deptIds.entries()].map(([dept, ids]) => {
      const rows = wedSweet.filter(s => ids.has(String(s.User_ID).trim()));
      let k = 0, f = 0, o = 0;
      for (const r of rows) {
        if (isOtherSweet(r)) o++;
        else if (isTrue(r.Status)) k++;
        else f++;
      }
      return { dept, kept: k, failed: f, other: o, total: k + f + o, rate: (k + f + o) ? (k / (k + f + o)) * 100 : 0 };
    }).filter(d => d.total > 0).sort((a, b) => b.kept - a.kept);
    // include depts with 0? keep only >0 to reduce noise

    // sweet cumulative overall (from first Wednesday after programStart to wedKey)
    // find all sweet with date in [programStart, wedKey] and is Wednesday
    const cumSweet = sweet.filter(s => {
      const k = toDateKey(s.Wednesday_Date);
      return k && k >= programStart && k <= wedKey;
    });
    let ck = 0, cf = 0, co = 0;
    for (const s of cumSweet) {
      if (isOtherSweet(s)) co++;
      else if (isTrue(s.Status)) ck++;
      else cf++;
    }
    const sweetCumulativeOverall = { kept: ck, failed: cf, other: co, total: ck + cf + co };
    // by week timeline
    const byWed = new Map<string, { kept: number; failed: number; other: number }>();
    for (const s of cumSweet) {
      const k = toDateKey(s.Wednesday_Date);
      if (!byWed.has(k)) byWed.set(k, { kept: 0, failed: 0, other: 0 });
      const cur = byWed.get(k)!;
      if (isOtherSweet(s)) cur.other++;
      else if (isTrue(s.Status)) cur.kept++;
      else cur.failed++;
    }
    const sweetCumulativeByWeek = [...byWed.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([wedKey2, v]) => ({ wedKey: wedKey2, ...v }));

    return {
      weekLabel: `${weekStartKey} - ${weekEndKey}`,
      weekStartKey,
      weekEndKey,
      wednesdayKey: wedKey,
      weekNumber,
      totalStepsWeek: totalWeek,
      totalStepsWeekCapped: totalWeekCapped,
      participantsWeek: weekMap.size,
      participantsTotal,
      deptWeek,
      deptCumulative,
      top5Week,
      top3ByDeptWeek,
      top10Cumulative,
      sweetWeekOverall,
      sweetWeekByDept,
      sweetCumulativeOverall,
      sweetCumulativeByWeek,
      rankingCriteria: RANKING_CRITERIA_TEXT,
    };
  }, [users, steps, sweet, weekStartKey, weekEndKey, wedKey, weekNumber, programStart]);

  const handlePrint = () => {
    const el = document.getElementById('weekly-report-print');
    if (!el) {
      window.print();
      return;
    }
    // Clone all <style> and <link rel=stylesheet> for isolated but faithful rendering
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(n => n.outerHTML).join('\n');
    const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>รายงานผลการจัดอันดับส่วนราชการ - สัปดาห์ที่ ${weekNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
${styleTags}
<style>
  /* ยึด A4 แนวตั้ง 210×297 mm ทุกหน้า — พื้นที่พิมพ์ 180×267 mm หลังหัก margin 15mm (ล่าง 20mm เผื่อ Footer) */
  @page { size: A4 portrait; size: 210mm 297mm; margin: 15mm 15mm 20mm 15mm; }
  html, body { font-family: 'Sarabun','TH Sarabun PSK',system-ui,sans-serif; color:#000; background:#fff; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page-container { width:100%; max-width:210mm; margin:0 auto; box-sizing: border-box; }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 100% !important; max-width: 100% !important; }
    .no-print { display:none !important; }
    .page-container { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
    .report-root { background:#fff !important; padding:0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
    .report-page { box-shadow:none !important; border:none !important; margin:0 auto !important; padding:0 !important; width:100% !important; max-width:100% !important; break-after: page; page-break-after: always; break-inside: auto; box-sizing: border-box; }
    .report-page:last-child { break-after: auto; page-break-after: auto; }
    /* ไหลต่อเนื่อง: ปล่อยไหลตาม A4 ได้เรื่อยๆ ไม่บังคับอยู่หน้าเดียวกัน */
    table { break-inside: auto !important; page-break-inside: auto !important; border-collapse: collapse !important; width: 100% !important; max-width: 100% !important; }
    thead { display: table-header-group !important; }
    tfoot { display: table-footer-group !important; }
    tr, tbody, td, th { break-inside: auto !important; page-break-inside: auto !important; }
    .section-block { break-inside: auto !important; page-break-inside: auto !important; }
    .section-title { break-inside: auto !important; page-break-inside: auto !important; break-after: auto !important; page-break-after: auto !important; }
    .keep-together { break-inside: auto !important; page-break-inside: auto !important; }
    .rounded-xl, .rounded-lg, .report-card { break-inside: auto !important; page-break-inside: auto !important; }
    /* Footer เลขหน้า ขวาล่าง ทุกหน้า */
    .print-footer { position: fixed !important; bottom: 8mm !important; right: 15mm !important; left: auto !important; font-size: 7.5pt !important; color: #6b7280 !important; font-family: 'Sarabun', sans-serif !important; display: block !important; }
    .print-footer::after { content: "หน้า " counter(page) " / " counter(pages); }
  }
  @media screen { .print-footer { display: none !important; } }
</style>
</head>
<body>
<div class="page-container">
${el.outerHTML}
</div>
<script>
  window.onload = function() { setTimeout(function(){ window.print(); }, 600); };
<\/script>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตให้เปิดแท็บใหม่แล้วลองอีกครั้ง (Popup blocked)');
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    // Focus new tab for mobile/desktop
    try { printWindow.focus(); } catch {}
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-gray-500">เฉพาะเจ้าหน้าที่ นสส. (Admin) เท่านั้นที่เข้าถึงรายงานนี้ได้</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* controls - no-print */}
      <div className="no-print bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 md:p-5 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">description</span>
              รายงานผลรายสัปดาห์ (A4)
            </h1>
            <p className="text-xs text-gray-500 mt-1">สัปดาห์ จันทร์-อาทิตย์ · เฉพาะ นสส. ดาวน์โหลด/พิมพ์ได้ · โลโก้ลาดพร้าวสร้างสุขฝังในเอกสาร</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow">
              <span className="material-symbols-outlined text-lg">print</span> พิมพ์ / บันทึก PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedWeekStart} onChange={e => setSelectedWeekStart(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium min-w-[260px]">
            {weeks.map(w => <option key={w.startKey} value={w.startKey}>{w.label} (จ–อา)</option>)}
          </select>
          <button onClick={() => { const idx = weeks.findIndex(w => w.startKey === selectedWeekStart); if (idx>0) setSelectedWeekStart(weeks[idx-1].startKey); }} disabled={weeks.findIndex(w=>w.startKey===selectedWeekStart)<=0} className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center disabled:opacity-40">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button onClick={() => { const idx = weeks.findIndex(w => w.startKey === selectedWeekStart); if (idx>=0 && idx<weeks.length-1) setSelectedWeekStart(weeks[idx+1].startKey); }} disabled={weeks.findIndex(w=>w.startKey===selectedWeekStart)>=weeks.length-1} className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center disabled:opacity-40">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
          <button onClick={() => { const todayKey = (()=>{ const d=new Date(); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); const m=new Date(d); m.setDate(diff); m.setHours(0,0,0,0); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;})(); const f=weeks.find(w=>todayKey>=w.startKey && todayKey<=w.endKey); if(f) setSelectedWeekStart(f.startKey); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700">กลับสัปดาห์นี้</button>
          <span className="text-xs text-gray-400 ml-2">{loading ? 'กำลังโหลด...' : computed ? `ก้าวรวม ${computed.totalStepsWeek.toLocaleString()} | ผู้ส่ง ${computed.participantsWeek} คน` : ''}</span>
        </div>
      </div>

      {/* report preview */}
      <div className="overflow-auto">
        <WeeklyReportDocument computed={computed} weekNumber={weekNumber} programStart={programStart} programEnd={programEnd} />
      </div>
    </div>
  );
}
